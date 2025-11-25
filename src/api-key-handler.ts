/**
 * API Key Authentication Handler for NBP Exchange MCP Server
 *
 * This module provides API key authentication support for MCP clients that don't support
 * OAuth flows (like AnythingLLM, Cursor IDE, custom scripts).
 *
 * Authentication flow:
 * 1. Extract API key from Authorization header
 * 2. Validate key using validateApiKey()
 * 3. Get user from database
 * 4. Create Props object (matching OAuth structure)
 * 5. Create MCP server with tools
 * 6. Handle MCP protocol request
 * 7. Return response
 */

import { validateApiKey } from "./apiKeys";
import { getUserById } from "./tokenUtils";
import type { Env } from "./types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchCurrencyRate, fetchGoldPrice, fetchCurrencyHistory } from "./nbp-client";
import { checkBalance, consumeTokensWithRetry } from "./tokenConsumption";
import { formatInsufficientTokensError, formatAccountDeletedError } from "./tokenUtils";
import { sanitizeOutput, redactPII } from 'pilpat-mcp-security';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

/**
 * Simple LRU (Least Recently Used) Cache for MCP Server instances
 *
 * IMPORTANT: This cache is ephemeral and Worker-instance-specific:
 *
 * 🔸 **Ephemeral (Non-Persistent):**
 *   - Cache is cleared when the Worker is evicted from memory
 *   - Eviction can happen at any time (deployments, inactivity, memory pressure)
 *   - NO guarantee of cache persistence between requests
 *
 * 🔸 **Worker-Instance-Specific:**
 *   - Different Worker instances (different data centers) have separate caches
 *   - A user in Warsaw and a user in New York access different caches
 *   - Cache is NOT replicated globally (unlike D1 database)
 *
 * 🔸 **Performance Optimization Only:**
 *   - This is a PERFORMANCE optimization, not critical state storage
 *   - Cache misses simply recreate the MCP server (acceptable overhead)
 *   - Critical state (balances, tokens, transactions) is stored in D1 database
 *
 * 🔸 **Why This Is Safe:**
 *   - MCP servers are stateless (tools query database on each call)
 *   - Recreating a server doesn't cause data loss or corruption
 *   - Token consumption is atomic via D1 transactions (not cached)
 *   - User balances are ALWAYS queried from database (never cached)
 *
 * 🔸 **LRU Eviction:**
 *   - When cache reaches MAX_SIZE, the least recently used server is evicted
 *   - This prevents unbounded memory growth
 *   - Evicted servers are simply garbage collected
 *
 * Reference: Cloudflare Docs - "In-memory state in Durable Objects"
 * https://developers.cloudflare.com/durable-objects/reference/in-memory-state/
 */
class LRUCache<K, V> {
  private cache: Map<K, { value: V; lastAccessed: number }>;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Get value from cache and update last accessed time
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // Update last accessed time (LRU tracking)
      entry.lastAccessed = Date.now();
      return entry.value;
    }
    return undefined;
  }

  /**
   * Set value in cache with automatic LRU eviction
   */
  set(key: K, value: V): void {
    // If cache is full, evict least recently used entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      lastAccessed: Date.now(),
    });
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Evict least recently used entry from cache
   */
  private evictLRU(): void {
    let oldestKey: K | undefined;
    let oldestTime = Infinity;

    // Find least recently used entry
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.cache.delete(oldestKey);
      console.log(`🗑️  [LRU Cache] Evicted server for user: ${String(oldestKey)}`);
    }
  }

  /**
   * Clear entire cache (useful for testing)
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Global MCP server cache
 *
 * Configuration:
 * - Max size: 1000 servers (prevents unbounded memory growth)
 * - Eviction policy: LRU (Least Recently Used)
 * - Lifetime: Until Worker is evicted from memory
 *
 * Typical memory usage:
 * - Each MCP server: ~50-100 KB
 * - 1000 servers: ~50-100 MB (acceptable for Workers)
 *
 * Workers have 128 MB memory limit, so 1000 servers leaves plenty of headroom.
 */
const MAX_CACHED_SERVERS = 1000;
const serverCache = new LRUCache<string, McpServer>(MAX_CACHED_SERVERS);

/**
 * Main entry point for API key authenticated MCP requests
 *
 * @param request - Incoming HTTP request
 * @param env - Cloudflare Workers environment
 * @param ctx - Execution context
 * @param pathname - Request pathname (/sse or /mcp)
 * @returns MCP protocol response
 */
export async function handleApiKeyRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string
): Promise<Response> {
  try {
    console.log(`🔐 [API Key Auth] Request to ${pathname}`);

    // 1. Extract API key from Authorization header
    const authHeader = request.headers.get("Authorization");
    const apiKey = authHeader?.replace("Bearer ", "");

    if (!apiKey) {
      console.log("❌ [API Key Auth] Missing Authorization header");
      return jsonError("Missing Authorization header", 401);
    }

    // 2. Validate API key and get user_id
    const userId = await validateApiKey(apiKey, env);

    if (!userId) {
      console.log("❌ [API Key Auth] Invalid or expired API key");
      return jsonError("Invalid or expired API key", 401);
    }

    // 3. Get user from database
    const dbUser = await getUserById(env.TOKEN_DB, userId);

    if (!dbUser) {
      // getUserById already checks is_deleted, so null means not found OR deleted
      console.log(`❌ [API Key Auth] User not found or deleted: ${userId}`);
      return jsonError("User not found or account deleted", 404);
    }

    console.log(
      `✅ [API Key Auth] Authenticated user: ${dbUser.email} (${userId}), balance: ${dbUser.current_token_balance} tokens`
    );

    // 4. Create or get cached MCP server with tools
    const server = await getOrCreateServer(env, userId, dbUser.email);

    // 5. Handle the MCP request using the appropriate transport
    if (pathname === "/sse") {
      return await handleSSETransport(server, request);
    } else if (pathname === "/mcp") {
      return await handleHTTPTransport(server, request, env, userId, dbUser.email);
    } else {
      return jsonError("Invalid endpoint. Use /sse or /mcp", 400);
    }
  } catch (error) {
    console.error("[API Key Auth] Error:", error);
    return jsonError(
      `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
      500
    );
  }
}

/**
 * Get or create MCP server instance for API key user
 *
 * This creates a standalone MCP server (not using McpAgent) with all NBP tools.
 * The server instance is cached per user to avoid recreating it on every request.
 *
 * Cache behavior:
 * - Cache hit: Returns existing server immediately (~1ms)
 * - Cache miss: Creates new server (~10-50ms), then caches it
 * - Cache full: Evicts least recently used server automatically
 *
 * @param env - Cloudflare Workers environment
 * @param userId - User ID for token management
 * @param email - User email for logging
 * @returns Configured MCP server instance
 */
async function getOrCreateServer(
  env: Env,
  userId: string,
  email: string
): Promise<McpServer> {
  // Check cache first
  const cached = serverCache.get(userId);
  if (cached) {
    console.log(
      `📦 [LRU Cache] HIT for user ${userId} (cache size: ${serverCache.size}/${MAX_CACHED_SERVERS})`
    );
    return cached;
  }

  console.log(
    `🔧 [LRU Cache] MISS for user ${userId} - creating new server (cache size: ${serverCache.size}/${MAX_CACHED_SERVERS})`
  );

  // Create new MCP server
  const server = new McpServer({
    name: "NBP Exchange Rates (API Key)",
    version: "1.0.0",
  });

  // Register all NBP tools (same as NbpMCP.init())
  // Tool 1: getCurrencyRate
  server.tool(
    "getCurrencyRate",
    "Get current or historical buy/sell exchange rates for a specific currency from the Polish National Bank (NBP). " +
      "Returns bid (bank buy) and ask (bank sell) prices in Polish Zloty (PLN) from NBP Table C. " +
      "Use this when you need to know how much a currency costs to exchange at Polish banks. " +
      "Note: NBP only publishes rates on trading days (Mon-Fri, excluding Polish holidays). " +
    {
      currencyCode: z
        .enum(["USD", "EUR", "GBP", "CHF", "AUD", "CAD", "SEK", "NOK", "DKK", "JPY", "CZK", "HUF"])
        .describe(
          "Three-letter ISO 4217 currency code (uppercase). " +
            "Supported currencies: USD, EUR, GBP, CHF, AUD, CAD, SEK, NOK, DKK, JPY, CZK, HUF"
        ),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe(
          "Optional: Specific date in YYYY-MM-DD format (e.g., '2025-10-01'). " +
            "If omitted, returns the most recent available rate. " +
            "Must be a trading day (not weekend/holiday) or you'll get a 404 error."
        ),
    },
    async ({ currencyCode, date }) => {
      const TOOL_COST = 1;
      const TOOL_NAME = "getCurrencyRate";
      const actionId = crypto.randomUUID();

      try {
        // Check balance
        const balanceCheck = await checkBalance(env.TOKEN_DB, userId, TOOL_COST);

        if (balanceCheck.userDeleted) {
          return {
            content: [{ type: "text" as const, text: formatAccountDeletedError(TOOL_NAME) }],
            isError: true,
          };
        }

        if (!balanceCheck.sufficient) {
          return {
            content: [
              {
                type: "text" as const,
                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST),
              },
            ],
            isError: true,
          };
        }

        // Execute tool
        const result = await fetchCurrencyRate(currencyCode, date);

        // Step 4.5: Security Processing (Phase 2)
        const sanitized = sanitizeOutput(JSON.stringify(result, null, 2), {
          removeHtml: true,
          removeControlChars: true,
          normalizeWhitespace: true,
          maxLength: 5000
        });

        const { redacted, detectedPII } = redactPII(sanitized, {
          redactEmails: false,
          redactPhones: true,
          redactCreditCards: true,
          redactSSN: true,
          redactBankAccounts: true,
          redactPESEL: true,
          redactPolishIdCard: true,
          redactPolishPassport: true,
          redactPolishPhones: true,
          placeholder: '[REDACTED]'
        });

        if (detectedPII.length > 0) {
          console.warn(`[Security] Tool ${TOOL_NAME}: Redacted PII types:`, detectedPII);
        }

        const finalResult = redacted;

        // Consume tokens
        await consumeTokensWithRetry(
          env.TOKEN_DB,
          userId,
          TOOL_COST,
          "nbp-exchange-mcp",
          TOOL_NAME,
          { currencyCode, date },
          finalResult,
          true,
          actionId
        );

        return {
          content: [{ type: "text" as const, text: finalResult }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 2: getGoldPrice (similar structure)
  server.tool(
    "getGoldPrice",
    "Get the official gold price from the Polish National Bank (NBP). " +
      "Returns the price for 1 gram of gold with 1000 millesimal fineness (pure gold) in Polish Zloty (PLN). " +
      "NBP publishes gold prices every trading day.",
    {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe(
          "Optional: Specific date in YYYY-MM-DD format. " +
            "If omitted, returns the most recent available price."
        ),
    },
    async ({ date }) => {
      const TOOL_COST = 1;
      const TOOL_NAME = "getGoldPrice";
      const actionId = crypto.randomUUID();

      try {
        const balanceCheck = await checkBalance(env.TOKEN_DB, userId, TOOL_COST);

        if (balanceCheck.userDeleted) {
          return {
            content: [{ type: "text" as const, text: formatAccountDeletedError(TOOL_NAME) }],
            isError: true,
          };
        }

        if (!balanceCheck.sufficient) {
          return {
            content: [
              {
                type: "text" as const,
                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST),
              },
            ],
            isError: true,
          };
        }

        const result = await fetchGoldPrice(date);

        // Step 4.5: Security Processing (Phase 2)
        const sanitized = sanitizeOutput(JSON.stringify(result, null, 2), {
          removeHtml: true,
          removeControlChars: true,
          normalizeWhitespace: true,
          maxLength: 5000
        });

        const { redacted, detectedPII } = redactPII(sanitized, {
          redactEmails: false,
          redactPhones: true,
          redactCreditCards: true,
          redactSSN: true,
          redactBankAccounts: true,
          redactPESEL: true,
          redactPolishIdCard: true,
          redactPolishPassport: true,
          redactPolishPhones: true,
          placeholder: '[REDACTED]'
        });

        if (detectedPII.length > 0) {
          console.warn(`[Security] Tool ${TOOL_NAME}: Redacted PII types:`, detectedPII);
        }

        const finalResult = redacted;

        await consumeTokensWithRetry(
          env.TOKEN_DB,
          userId,
          TOOL_COST,
          "nbp-exchange-mcp",
          TOOL_NAME,
          { date },
          finalResult,
          true,
          actionId
        );

        return {
          content: [{ type: "text" as const, text: finalResult }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 3: getCurrencyHistory (similar structure)
  server.tool(
    "getCurrencyHistory",
    "Get historical currency exchange rate series over a date range from the Polish National Bank (NBP). " +
      "Returns bid/ask prices for each trading day in the range. Maximum 93 days of data. " +
    {
      currencyCode: z
        .enum(["USD", "EUR", "GBP", "CHF", "AUD", "CAD", "SEK", "NOK", "DKK", "JPY", "CZK", "HUF"])
        .describe("Three-letter ISO 4217 currency code"),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Start date in YYYY-MM-DD format"),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("End date in YYYY-MM-DD format (max 93 days from start)"),
    },
    async ({ currencyCode, startDate, endDate }) => {
      const TOOL_COST = 1;
      const TOOL_NAME = "getCurrencyHistory";
      const actionId = crypto.randomUUID();

      try {
        const balanceCheck = await checkBalance(env.TOKEN_DB, userId, TOOL_COST);

        if (balanceCheck.userDeleted) {
          return {
            content: [{ type: "text" as const, text: formatAccountDeletedError(TOOL_NAME) }],
            isError: true,
          };
        }

        if (!balanceCheck.sufficient) {
          return {
            content: [
              {
                type: "text" as const,
                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST),
              },
            ],
            isError: true,
          };
        }

        const result = await fetchCurrencyHistory(currencyCode, startDate, endDate);

        // Step 4.5: Security Processing (Phase 2)
        const sanitized = sanitizeOutput(JSON.stringify(result, null, 2), {
          removeHtml: true,
          removeControlChars: true,
          normalizeWhitespace: true,
          maxLength: 5000
        });

        const { redacted, detectedPII } = redactPII(sanitized, {
          redactEmails: false,
          redactPhones: true,
          redactCreditCards: true,
          redactSSN: true,
          redactBankAccounts: true,
          redactPESEL: true,
          redactPolishIdCard: true,
          redactPolishPassport: true,
          redactPolishPhones: true,
          placeholder: '[REDACTED]'
        });

        if (detectedPII.length > 0) {
          console.warn(`[Security] Tool ${TOOL_NAME}: Redacted PII types:`, detectedPII);
        }

        const finalResult = redacted;

        await consumeTokensWithRetry(
          env.TOKEN_DB,
          userId,
          TOOL_COST,
          "nbp-exchange-mcp",
          TOOL_NAME,
          { currencyCode, startDate, endDate },
          finalResult,
          true,
          actionId
        );

        return {
          content: [{ type: "text" as const, text: finalResult }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Cache the server (automatic LRU eviction if cache is full)
  serverCache.set(userId, server);

  console.log(
    `✅ [LRU Cache] Server created and cached for user ${userId} (cache size: ${serverCache.size}/${MAX_CACHED_SERVERS})`
  );
  return server;
}

/**
 * Handle HTTP (Streamable HTTP) transport for MCP protocol
 *
 * Streamable HTTP is the modern MCP transport protocol that replaced SSE.
 * It uses standard HTTP POST requests with JSON-RPC 2.0 protocol.
 *
 * Supported JSON-RPC methods:
 * - initialize: Protocol handshake and capability negotiation
 * - tools/list: List all available tools
 * - tools/call: Execute a specific tool
 *
 * @param server - Configured MCP server instance
 * @param request - Incoming HTTP POST request with JSON-RPC message
 * @param env - Cloudflare Workers environment
 * @param userId - User ID for logging
 * @param userEmail - User email for logging
 * @returns JSON-RPC response
 */
async function handleHTTPTransport(
  server: McpServer,
  request: Request,
  env: Env,
  userId: string,
  userEmail: string
): Promise<Response> {
  console.log(`📡 [API Key Auth] HTTP transport request from ${userEmail}`);

  try {
    // Parse JSON-RPC request
    const jsonRpcRequest = await request.json() as {
      jsonrpc: string;
      id: number | string;
      method: string;
      params?: any;
    };

    console.log(`📨 [HTTP] Method: ${jsonRpcRequest.method}, ID: ${jsonRpcRequest.id}`);

    // Validate JSON-RPC 2.0 format
    if (jsonRpcRequest.jsonrpc !== "2.0") {
      return jsonRpcResponse(jsonRpcRequest.id, null, {
        code: -32600,
        message: "Invalid Request: jsonrpc must be '2.0'",
      });
    }

    // Route to appropriate handler based on method
    switch (jsonRpcRequest.method) {
      case "initialize":
        return handleInitialize(jsonRpcRequest);

      case "ping":
        return handlePing(jsonRpcRequest);

      case "tools/list":
        return await handleToolsList(server, jsonRpcRequest);

      case "tools/call":
        return await handleToolsCall(server, jsonRpcRequest, env, userId, userEmail);

      default:
        return jsonRpcResponse(jsonRpcRequest.id, null, {
          code: -32601,
          message: `Method not found: ${jsonRpcRequest.method}`,
        });
    }
  } catch (error) {
    console.error("❌ [HTTP] Error:", error);
    return jsonRpcResponse("error", null, {
      code: -32700,
      message: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle initialize request (MCP protocol handshake)
 */
function handleInitialize(request: {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: any;
}): Response {
  console.log("✅ [HTTP] Initialize request");

  return jsonRpcResponse(request.id, {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: "NBP Exchange MCP",
      version: "1.0.0",
    },
  });
}

/**
 * Handle ping request (health check)
 */
function handlePing(request: {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: any;
}): Response {
  console.log("✅ [HTTP] Ping request");

  return jsonRpcResponse(request.id, {});
}

/**
 * Handle tools/list request (list all available tools)
 */
async function handleToolsList(
  server: McpServer,
  request: {
    jsonrpc: string;
    id: number | string;
    method: string;
    params?: any;
  }
): Promise<Response> {
  console.log("✅ [HTTP] Tools list request");

  // Manually define tools since McpServer doesn't expose listTools()
  // These match the tools registered in getOrCreateServer()
  const tools = [
    {
      name: "getCurrencyRate",
      description:
        "Get current or historical buy/sell exchange rates for a specific currency from the Polish National Bank (NBP). " +
        "Returns bid (buy) and ask (sell) prices for the specified date or most recent trading day. " +
      inputSchema: {
        type: "object",
        properties: {
          currencyCode: {
            type: "string",
            enum: ["USD", "EUR", "GBP", "CHF", "AUD", "CAD", "SEK", "NOK", "DKK", "JPY", "CZK", "HUF"],
            description: "Three-letter ISO 4217 currency code",
          },
          date: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            description:
              "Optional: Specific date in YYYY-MM-DD format. If omitted, returns the most recent available rate.",
          },
        },
        required: ["currencyCode"],
      },
    },
    {
      name: "getGoldPrice",
      description:
        "Get the official gold price in PLN per gram from the Polish National Bank (NBP). " +
        "Returns the price for a specific date or the most recent trading day. " +
      inputSchema: {
        type: "object",
        properties: {
          date: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            description:
              "Optional: Specific date in YYYY-MM-DD format. If omitted, returns the most recent available price.",
          },
        },
      },
    },
    {
      name: "getCurrencyHistory",
      description:
        "Get historical currency exchange rate series over a date range from the Polish National Bank (NBP). " +
        "Returns bid/ask prices for each trading day in the range. Maximum 93 days of data. " +
      inputSchema: {
        type: "object",
        properties: {
          currencyCode: {
            type: "string",
            enum: ["USD", "EUR", "GBP", "CHF", "AUD", "CAD", "SEK", "NOK", "DKK", "JPY", "CZK", "HUF"],
            description: "Three-letter ISO 4217 currency code",
          },
          startDate: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            description: "Start date in YYYY-MM-DD format",
          },
          endDate: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            description: "End date in YYYY-MM-DD format (max 93 days from start)",
          },
        },
        required: ["currencyCode", "startDate", "endDate"],
      },
    },
  ];

  return jsonRpcResponse(request.id, {
    tools,
  });
}

/**
 * Handle tools/call request (execute a tool)
 */
async function handleToolsCall(
  server: McpServer,
  request: {
    jsonrpc: string;
    id: number | string;
    method: string;
    params?: {
      name: string;
      arguments?: Record<string, any>;
    };
  },
  env: Env,
  userId: string,
  userEmail: string
): Promise<Response> {
  if (!request.params || !request.params.name) {
    return jsonRpcResponse(request.id, null, {
      code: -32602,
      message: "Invalid params: name is required",
    });
  }

  const toolName = request.params.name;
  const toolArgs = request.params.arguments || {};

  console.log(`🔧 [HTTP] Tool call: ${toolName} by ${userEmail}`, toolArgs);

  try {
    // Execute tool logic based on tool name
    // This duplicates the logic from getOrCreateServer() but is necessary
    // because McpServer doesn't expose a way to call tools directly

    let result: any;

    switch (toolName) {
      case "getCurrencyRate":
        result = await executeCurrencyRateTool(toolArgs, env, userId);
        break;

      case "getGoldPrice":
        result = await executeGoldPriceTool(toolArgs, env, userId);
        break;

      case "getCurrencyHistory":
        result = await executeCurrencyHistoryTool(toolArgs, env, userId);
        break;

      default:
        return jsonRpcResponse(request.id, null, {
          code: -32601,
          message: `Unknown tool: ${toolName}`,
        });
    }

    console.log(`✅ [HTTP] Tool ${toolName} completed successfully`);

    return jsonRpcResponse(request.id, result);
  } catch (error) {
    console.error(`❌ [HTTP] Tool ${toolName} failed:`, error);
    return jsonRpcResponse(request.id, null, {
      code: -32603,
      message: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Execute getCurrencyRate tool
 */
async function executeCurrencyRateTool(
  args: Record<string, any>,
  env: Env,
  userId: string
): Promise<any> {
  const TOOL_COST = 1;
  const TOOL_NAME = "getCurrencyRate";
  const actionId = crypto.randomUUID();

  const balanceCheck = await checkBalance(env.TOKEN_DB, userId, TOOL_COST);

  if (balanceCheck.userDeleted) {
    return {
      content: [{ type: "text" as const, text: formatAccountDeletedError(TOOL_NAME) }],
      isError: true,
    };
  }

  if (!balanceCheck.sufficient) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST),
        },
      ],
      isError: true,
    };
  }

  const result = await fetchCurrencyRate(args.currencyCode, args.date);

  // Step 4.5: Security Processing (Phase 2)
  const sanitized = sanitizeOutput(JSON.stringify(result, null, 2), {
    removeHtml: true,
    removeControlChars: true,
    normalizeWhitespace: true,
    maxLength: 5000
  });

  const { redacted, detectedPII } = redactPII(sanitized, {
    redactEmails: false,
    redactPhones: true,
    redactCreditCards: true,
    redactSSN: true,
    redactBankAccounts: true,
    redactPESEL: true,
    redactPolishIdCard: true,
    redactPolishPassport: true,
    redactPolishPhones: true,
    placeholder: '[REDACTED]'
  });

  if (detectedPII.length > 0) {
    console.warn(`[Security] Tool ${TOOL_NAME}: Redacted PII types:`, detectedPII);
  }

  const finalResult = redacted;

  await consumeTokensWithRetry(
    env.TOKEN_DB,
    userId,
    TOOL_COST,
    "nbp-exchange-mcp",
    TOOL_NAME,
    args,
    finalResult,
    true,
    actionId
  );

  return {
    content: [{ type: "text" as const, text: finalResult }],
  };
}

/**
 * Execute getGoldPrice tool
 */
async function executeGoldPriceTool(
  args: Record<string, any>,
  env: Env,
  userId: string
): Promise<any> {
  const TOOL_COST = 1;
  const TOOL_NAME = "getGoldPrice";
  const actionId = crypto.randomUUID();

  const balanceCheck = await checkBalance(env.TOKEN_DB, userId, TOOL_COST);

  if (balanceCheck.userDeleted) {
    return {
      content: [{ type: "text" as const, text: formatAccountDeletedError(TOOL_NAME) }],
      isError: true,
    };
  }

  if (!balanceCheck.sufficient) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST),
        },
      ],
      isError: true,
    };
  }

  const result = await fetchGoldPrice(args.date);

  // Step 4.5: Security Processing (Phase 2)
  const sanitized = sanitizeOutput(JSON.stringify(result, null, 2), {
    removeHtml: true,
    removeControlChars: true,
    normalizeWhitespace: true,
    maxLength: 5000
  });

  const { redacted, detectedPII } = redactPII(sanitized, {
    redactEmails: false,
    redactPhones: true,
    redactCreditCards: true,
    redactSSN: true,
    redactBankAccounts: true,
    redactPESEL: true,
    redactPolishIdCard: true,
    redactPolishPassport: true,
    redactPolishPhones: true,
    placeholder: '[REDACTED]'
  });

  if (detectedPII.length > 0) {
    console.warn(`[Security] Tool ${TOOL_NAME}: Redacted PII types:`, detectedPII);
  }

  const finalResult = redacted;

  await consumeTokensWithRetry(
    env.TOKEN_DB,
    userId,
    TOOL_COST,
    "nbp-exchange-mcp",
    TOOL_NAME,
    args,
    finalResult,
    true,
    actionId
  );

  return {
    content: [{ type: "text" as const, text: finalResult }],
  };
}

/**
 * Execute getCurrencyHistory tool
 */
async function executeCurrencyHistoryTool(
  args: Record<string, any>,
  env: Env,
  userId: string
): Promise<any> {
  const TOOL_COST = 1;
  const TOOL_NAME = "getCurrencyHistory";
  const actionId = crypto.randomUUID();

  const balanceCheck = await checkBalance(env.TOKEN_DB, userId, TOOL_COST);

  if (balanceCheck.userDeleted) {
    return {
      content: [{ type: "text" as const, text: formatAccountDeletedError(TOOL_NAME) }],
      isError: true,
    };
  }

  if (!balanceCheck.sufficient) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST),
        },
      ],
      isError: true,
    };
  }

  const result = await fetchCurrencyHistory(args.currencyCode, args.startDate, args.endDate);

  // Step 4.5: Security Processing (Phase 2)
  const sanitized = sanitizeOutput(JSON.stringify(result, null, 2), {
    removeHtml: true,
    removeControlChars: true,
    normalizeWhitespace: true,
    maxLength: 5000
  });

  const { redacted, detectedPII } = redactPII(sanitized, {
    redactEmails: false,
    redactPhones: true,
    redactCreditCards: true,
    redactSSN: true,
    redactBankAccounts: true,
    redactPESEL: true,
    redactPolishIdCard: true,
    redactPolishPassport: true,
    redactPolishPhones: true,
    placeholder: '[REDACTED]'
  });

  if (detectedPII.length > 0) {
    console.warn(`[Security] Tool ${TOOL_NAME}: Redacted PII types:`, detectedPII);
  }

  const finalResult = redacted;

  await consumeTokensWithRetry(
    env.TOKEN_DB,
    userId,
    TOOL_COST,
    "nbp-exchange-mcp",
    TOOL_NAME,
    args,
    finalResult,
    true,
    actionId
  );

  return {
    content: [{ type: "text" as const, text: finalResult }],
  };
}

/**
 * Create a JSON-RPC 2.0 response
 */
function jsonRpcResponse(
  id: number | string,
  result: any = null,
  error: { code: number; message: string } | null = null
): Response {
  const response: any = {
    jsonrpc: "2.0",
    id,
  };

  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Handle SSE (Server-Sent Events) transport for MCP protocol
 *
 * SSE is used by AnythingLLM and other clients for real-time MCP communication.
 * This uses the standard MCP SDK SSEServerTransport for Cloudflare Workers.
 *
 * @param server - Configured MCP server instance
 * @param request - Incoming HTTP request
 * @returns SSE response stream
 */
async function handleSSETransport(server: McpServer, request: Request): Promise<Response> {
  console.log("📡 [API Key Auth] Setting up SSE transport");

  try {
    // For Cloudflare Workers, we need to return a Response with a ReadableStream
    // The MCP SDK's SSEServerTransport expects Node.js streams, so we'll implement
    // SSE manually for Cloudflare Workers compatibility

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Send SSE headers
    const response = new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });

    // Connect server to client (handle in background)
    // Note: This is a simplified implementation for API key auth
    // Full SSE support would require handling POST messages from client

    (async () => {
      try {
        // Send initial connection event
        await writer.write(encoder.encode("event: message\n"));
        await writer.write(encoder.encode('data: {"status":"connected"}\n\n'));

        console.log("✅ [API Key Auth] SSE connection established");

        // Keep connection alive
        const keepAliveInterval = setInterval(async () => {
          try {
            await writer.write(encoder.encode(": keepalive\n\n"));
          } catch (e) {
            clearInterval(keepAliveInterval);
          }
        }, 30000);

        // Note: Full MCP protocol implementation would go here
        // For MVP, we're providing basic SSE connectivity
      } catch (error) {
        console.error("❌ [API Key Auth] SSE error:", error);
        await writer.close();
      }
    })();

    return response;
  } catch (error) {
    console.error("❌ [API Key Auth] SSE transport error:", error);
    throw error;
  }
}

/**
 * Helper function to return JSON error responses
 *
 * @param message - Error message
 * @param status - HTTP status code
 * @returns JSON error response
 */
function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      error: message,
      status: status,
    }),
    {
      status: status,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}
