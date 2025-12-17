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

import { validateApiKey } from "./auth/apiKeys";
import type { Env } from "./types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { executeGetCurrencyHistory } from "./tools/nbp-tools";
import {
    GetCurrencyRateInput,
    GetGoldPriceInput,
    GetCurrencyHistoryInput
} from "./schemas/inputs";
import {
    GetCurrencyRateOutputSchema,
    GetGoldPriceOutputSchema,
    GetCurrencyHistoryOutputSchema
} from "./schemas/outputs";
import { fetchCurrencyRate, fetchGoldPrice } from "./api-client";
import { logger } from "./shared/logger";

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
      logger.info({ event: "lru_cache_eviction", evicted_user_id: String(oldestKey), cache_size: this.cache.size });
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
    // 1. Extract API key from Authorization header
    const authHeader = request.headers.get("Authorization");
    const apiKey = authHeader?.replace("Bearer ", "");

    if (!apiKey) {
      logger.warn({ event: "auth_attempt", method: "api_key", success: false, reason: "Missing Authorization header" });
      return jsonError("Missing Authorization header", 401);
    }

    // 2. Validate API key and get user info
    const validationResult = await validateApiKey(apiKey, env);

    if (!validationResult) {
      logger.warn({ event: "auth_attempt", method: "api_key", success: false, reason: "Invalid or expired API key" });
      return jsonError("Invalid or expired API key", 401);
    }

    // FREE server - no token balance check needed
    const { userId, email } = validationResult;

    logger.info({ event: "auth_attempt", method: "api_key", success: true, user_id: userId, user_email: email });

    // 3. Create or get cached MCP server with tools
    const server = await getOrCreateServer(env, userId, email);

    // 4. Handle the MCP request using the appropriate transport
    if (pathname === "/sse") {
      return await handleSSETransport(server, request);
    } else if (pathname === "/mcp") {
      return await handleHTTPTransport(server, request, env, userId, email);
    } else {
      return jsonError("Invalid endpoint. Use /sse or /mcp", 400);
    }
  } catch (error) {
    logger.error({ event: "server_error", error: String(error), context: "API Key Auth", pathname });
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
    logger.info({ event: "cache_operation", operation: "hit", key: userId });
    return cached;
  }

  logger.info({ event: "cache_operation", operation: "miss", key: userId });

  // Create new MCP server
  const server = new McpServer({
    name: "NBP Exchange Rates (API Key)",
    version: "1.0.0",
  });

  // Register all NBP tools - FREE, no token consumption
  // Tool 1: getCurrencyRate
  server.registerTool(
    "getCurrencyRate",
    {
      title: "Get Currency Exchange Rate",
      description: "Get current or historical buy/sell exchange rates for a specific currency from the Polish National Bank (NBP). " +
        "Returns bid (bank buy) and ask (bank sell) prices in Polish Zloty (PLN) from NBP Table C. " +
        "Use this when you need to know how much a currency costs to exchange at Polish banks. " +
        "Note: NBP only publishes rates on trading days (Mon-Fri, excluding Polish holidays). ",
      inputSchema: GetCurrencyRateInput,
      outputSchema: GetCurrencyRateOutputSchema
    },
    async (params) => {
      try {
        const result = await fetchCurrencyRate(params.currencyCode, params.date);
        console.log(`[Tool] getCurrencyRate completed for user ${userId}`);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        console.error(`[Tool] getCurrencyRate failed: ${error}`);
        return { content: [{ type: "text" as const, text: `Error: ${error}` }], isError: true };
      }
    }
  );

  // Tool 2: getGoldPrice
  server.registerTool(
    "getGoldPrice",
    {
      title: "Get Gold Price",
      description: "Get the official price of 1 gram of gold (1000 millesimal fineness) in Polish Zloty (PLN) " +
        "as calculated and published by the Polish National Bank (NBP). " +
        "Use this for investment analysis, comparing gold prices over time, or checking current gold valuation. " +
        "Note: Prices are only published on trading days (Mon-Fri, excluding holidays). " +
        "Historical data available from January 2, 2013 onwards. ",
      inputSchema: GetGoldPriceInput,
      outputSchema: GetGoldPriceOutputSchema
    },
    async (params) => {
      try {
        const result = await fetchGoldPrice(params.date);
        console.log(`[Tool] getGoldPrice completed for user ${userId}`);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        console.error(`[Tool] getGoldPrice failed: ${error}`);
        return { content: [{ type: "text" as const, text: `Error: ${error}` }], isError: true };
      }
    }
  );

  // Tool 3: getCurrencyHistory
  server.registerTool(
    "getCurrencyHistory",
    {
      title: "Get Currency History",
      description: "Get a time series of historical exchange rates for a currency over a date range. " +
        "Returns buy/sell rates (bid/ask) in PLN for each trading day within the specified period. " +
        "Useful for analyzing currency trends, calculating average rates, or comparing rates across months. " +
        "IMPORTANT: NBP API limit is maximum 93 days per query. Only trading days are included (weekends/holidays are skipped). ",
      inputSchema: GetCurrencyHistoryInput,
      outputSchema: GetCurrencyHistoryOutputSchema
    },
    async (params) => {
      return executeGetCurrencyHistory(params, env, userId) as any;
    }
  );

  // Cache the server (automatic LRU eviction if cache is full)
  serverCache.set(userId, server);

  logger.info({ event: "cache_operation", operation: "set", key: userId });
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
  logger.info({ event: "transport_request", transport: "http", method: "POST", user_email: userEmail });

  /**
   * Security: Token-based authentication provides primary protection
   * - API key validation (database lookup, format check)
   * - User account verification (is_deleted flag)
   * - Token balance validation
   * - Cloudflare Workers infrastructure (runs on *.workers.dev, not localhost)
   * No origin whitelist - breaks compatibility with MCP clients (Claude, Cursor, custom clients)
   */

  try {
    // Parse JSON-RPC request
    const jsonRpcRequest = await request.json() as {
      jsonrpc: string;
      id: number | string;
      method: string;
      params?: any;
    };

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
    logger.error({ event: "server_error", error: String(error), context: "HTTP transport" });
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

  // Manually define tools since McpServer doesn't expose listTools()
  // These match the tools registered in getOrCreateServer()
  const tools = [
    {
      name: "getCurrencyRate",
      title: "Get Currency Exchange Rate",
      description:
        "Get current or historical buy/sell exchange rates for a specific currency from the Polish National Bank (NBP). " +
        "Returns bid (buy) and ask (sell) prices for the specified date or most recent trading day. ",
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
      outputSchema: {
        type: "object",
        properties: {
          table: { type: "string" },
          currency: { type: "string" },
          code: { type: "string" },
          bid: { type: "number" },
          ask: { type: "number" },
          tradingDate: { type: "string" },
          effectiveDate: { type: "string" },
        },
      },
    },
    {
      name: "getGoldPrice",
      title: "Get Gold Price",
      description:
        "Get the official price of 1 gram of gold (1000 millesimal fineness) in Polish Zloty (PLN) " +
        "as calculated and published by the Polish National Bank (NBP). " +
        "Use this for investment analysis, comparing gold prices over time, or checking current gold valuation. " +
        "Note: Prices are only published on trading days (Mon-Fri, excluding holidays). " +
        "Historical data available from January 2, 2013 onwards. ",
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
      outputSchema: {
        type: "object",
        properties: {
          date: { type: "string" },
          price: { type: "number" },
        },
      },
    },
    {
      name: "getCurrencyHistory",
      title: "Get Currency History",
      description:
        "Get a time series of historical exchange rates for a currency over a date range. " +
        "Returns buy/sell rates (bid/ask) in PLN for each trading day within the specified period. " +
        "Useful for analyzing currency trends, calculating average rates, or comparing rates across months. " +
        "IMPORTANT: NBP API limit is maximum 93 days per query. Only trading days are included (weekends/holidays are skipped). ",
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
      outputSchema: {
        type: "object",
        properties: {
          table: { type: "string" },
          currency: { type: "string" },
          code: { type: "string" },
          rates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tradingDate: { type: "string" },
                effectiveDate: { type: "string" },
                bid: { type: "number" },
                ask: { type: "number" },
              },
            },
          },
        },
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

    return jsonRpcResponse(request.id, result);
  } catch (error) {
    logger.error({ event: "tool_failed", tool: toolName, user_email: userEmail, user_id: userId, error: String(error) });
    return jsonRpcResponse(request.id, null, {
      code: -32603,
      message: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Execute getCurrencyRate tool - FREE
 */
async function executeCurrencyRateTool(
  args: Record<string, any>,
  _env: Env,
  userId: string
): Promise<any> {
  try {
    const result = await fetchCurrencyRate(args.currencyCode, args.date);
    console.log(`[Tool] getCurrencyRate completed for user ${userId}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error}` }], isError: true };
  }
}

/**
 * Execute getGoldPrice tool - FREE
 */
async function executeGoldPriceTool(
  args: Record<string, any>,
  _env: Env,
  userId: string
): Promise<any> {
  try {
    const result = await fetchGoldPrice(args.date);
    console.log(`[Tool] getGoldPrice completed for user ${userId}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error}` }], isError: true };
  }
}

/**
 * Execute getCurrencyHistory tool (uses tool extractor with pre-validation)
 */
async function executeCurrencyHistoryTool(
  args: Record<string, any>,
  env: Env,
  userId: string
): Promise<any> {
  return executeGetCurrencyHistory(args as any, env, userId);
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
        logger.error({ event: "sse_connection", status: "error", user_email: "unknown", error: String(error) });
        await writer.close();
      }
    })();

    return response;
  } catch (error) {
    logger.error({ event: "server_error", error: String(error), context: "SSE transport" });
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
