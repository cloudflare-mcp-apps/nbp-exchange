import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchCurrencyRate, fetchGoldPrice, fetchCurrencyHistory } from "./nbp-client";
import type { Env } from "./types";
import type { Props } from "./props";
import { checkBalance, consumeTokensWithRetry } from "./tokenConsumption";
import { formatInsufficientTokensError, formatAccountDeletedError } from "./tokenUtils";

/**
 * NBP Exchange MCP Server with WorkOS Authentication
 *
 * Provides access to Polish National Bank (NBP) currency exchange rates and gold prices
 * via their public API. All tools are protected by WorkOS Magic Auth authentication.
 *
 * Generic type parameters:
 * - Env: Cloudflare Workers environment bindings (KV, WorkOS credentials)
 * - unknown: No state management (stateless server)
 * - Props: Authenticated user context from WorkOS (user, tokens, permissions)
 *
 * Authentication flow:
 * 1. User connects via MCP client
 * 2. Redirected to WorkOS AuthKit (Magic Auth)
 * 3. User enters email → receives 6-digit code
 * 4. After authentication, user info available via this.props
 * 5. All NBP tools become accessible
 */
export class NbpMCP extends McpAgent<Env, unknown, Props> {
    server = new McpServer({
        name: "NBP Exchange Rates",
        version: "1.0.0",
    });

    // NO initialState - this is a stateless server
    // NO setState() - no state management needed
    // NO onStateUpdate() - no state to update

    async init() {
        // Tool 1: Get current or historical currency rate (Costs 1 token)
        this.server.tool(
            "getCurrencyRate",
            "Get current or historical buy/sell exchange rates for a specific currency from the Polish National Bank (NBP). " +
            "Returns bid (bank buy) and ask (bank sell) prices in Polish Zloty (PLN) from NBP Table C. " +
            "Use this when you need to know how much a currency costs to exchange at Polish banks. " +
            "Note: NBP only publishes rates on trading days (Mon-Fri, excluding Polish holidays). " +
            "⚠️ This tool costs 1 token per use.",
            {
                currencyCode: z.enum([
                    "USD", "EUR", "GBP", "CHF", "AUD", "CAD",
                    "SEK", "NOK", "DKK", "JPY", "CZK", "HUF"
                ]).describe(
                    "Three-letter ISO 4217 currency code (uppercase). " +
                    "Supported currencies: USD, EUR, GBP, CHF, AUD, CAD, SEK, NOK, DKK, JPY, CZK, HUF"
                ),

                date: z.string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/)
                    .optional()
                    .describe(
                        "Optional: Specific date in YYYY-MM-DD format (e.g., '2025-10-01'). " +
                        "If omitted, returns the most recent available rate. " +
                        "Must be a trading day (not weekend/holiday) or you'll get a 404 error."
                    ),
            },
            async ({ currencyCode, date }) => {
                const TOOL_COST = 1; // All NBP tools cost 1 token
                const TOOL_NAME = "getCurrencyRate";

                // 0. Pre-generate action_id for idempotency
                const actionId = crypto.randomUUID();

                try {
                    // 1. Get user ID from props (set during OAuth)
                    const userId = this.props?.userId;
                    if (!userId) {
                        throw new Error("User ID not found in authentication context");
                    }

                    // 2. Check token balance (ALWAYS query database for current balance)
                    const balanceCheck = await checkBalance(this.env.DB, userId, TOOL_COST);

                    // 3a. UX IMPROVEMENT: If account deleted, show specific error message
                    if (balanceCheck.userDeleted) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: formatAccountDeletedError(TOOL_NAME)
                            }],
                            isError: true
                        };
                    }

                    // 3b. If insufficient balance, return error message in Polish
                    if (!balanceCheck.sufficient) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST)
                            }],
                            isError: true
                        };
                    }

                    // 4. Execute the NBP API call and capture result
                    const result = await fetchCurrencyRate(currencyCode, date);

                    // 5. Consume tokens WITH RETRY and idempotency protection
                    await consumeTokensWithRetry(
                        this.env.DB,
                        userId,
                        TOOL_COST,
                        "nbp-exchange-mcp",
                        TOOL_NAME,
                        { currencyCode, date },  // action params
                        result,                   // action result - logged for audit
                        true,                     // success flag
                        actionId                  // pre-generated for idempotency
                    );

                    // 6. Return successful result
                    return {
                        content: [{
                            type: "text" as const,
                            text: JSON.stringify(result, null, 2)
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`
                        }],
                        isError: true
                    };
                }
            }
        );

        // Tool 2: Get gold price (Costs 1 token)
        this.server.tool(
            "getGoldPrice",
            "Get the official price of 1 gram of gold (1000 millesimal fineness) in Polish Zloty (PLN) " +
            "as calculated and published by the Polish National Bank (NBP). " +
            "Use this for investment analysis, comparing gold prices over time, or checking current gold valuation. " +
            "Note: Prices are only published on trading days (Mon-Fri, excluding holidays). " +
            "Historical data available from January 2, 2013 onwards. " +
            "⚠️ This tool costs 1 token per use.",
            {
                date: z.string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/)
                    .optional()
                    .describe(
                        "Optional: Specific date in YYYY-MM-DD format (e.g., '2025-10-01'). " +
                        "If omitted, returns the most recent available gold price. " +
                        "Must be a trading day after 2013-01-02, or you'll get a 404 error."
                    ),
            },
            async ({ date }) => {
                const TOOL_COST = 1; // All NBP tools cost 1 token
                const TOOL_NAME = "getGoldPrice";

                // 0. Pre-generate action_id for idempotency
                const actionId = crypto.randomUUID();

                try {
                    // 1. Get user ID from props (set during OAuth)
                    const userId = this.props?.userId;
                    if (!userId) {
                        throw new Error("User ID not found in authentication context");
                    }

                    // 2. Check token balance (ALWAYS query database for current balance)
                    const balanceCheck = await checkBalance(this.env.DB, userId, TOOL_COST);

                    // 3a. UX IMPROVEMENT: If account deleted, show specific error message
                    if (balanceCheck.userDeleted) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: formatAccountDeletedError(TOOL_NAME)
                            }],
                            isError: true
                        };
                    }

                    // 3b. If insufficient balance, return error message in Polish
                    if (!balanceCheck.sufficient) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST)
                            }],
                            isError: true
                        };
                    }

                    // 4. Execute the NBP API call and capture result
                    const result = await fetchGoldPrice(date);

                    // 5. Consume tokens WITH RETRY and idempotency protection
                    await consumeTokensWithRetry(
                        this.env.DB,
                        userId,
                        TOOL_COST,
                        "nbp-exchange-mcp",
                        TOOL_NAME,
                        { date },     // action params
                        result,       // action result - logged for audit
                        true,         // success flag
                        actionId      // pre-generated for idempotency
                    );

                    // 6. Return successful result
                    return {
                        content: [{
                            type: "text" as const,
                            text: JSON.stringify(result, null, 2)
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`
                        }],
                        isError: true
                    };
                }
            }
        );

        // Tool 3: Get historical currency rate series (Costs 1 token)
        this.server.tool(
            "getCurrencyHistory",
            "Get a time series of historical exchange rates for a currency over a date range. " +
            "Returns buy/sell rates (bid/ask) in PLN for each trading day within the specified period. " +
            "Useful for analyzing currency trends, calculating average rates, or comparing rates across months. " +
            "IMPORTANT: NBP API limit is maximum 93 days per query. Only trading days are included (weekends/holidays are skipped). " +
            "⚠️ This tool costs 1 token per use.",
            {
                currencyCode: z.enum([
                    "USD", "EUR", "GBP", "CHF", "AUD", "CAD",
                    "SEK", "NOK", "DKK", "JPY", "CZK", "HUF"
                ]).describe(
                    "Three-letter ISO 4217 currency code (uppercase). " +
                    "Supported currencies: USD, EUR, GBP, CHF, AUD, CAD, SEK, NOK, DKK, JPY, CZK, HUF"
                ),

                startDate: z.string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/)
                    .describe(
                        "Start date in YYYY-MM-DD format (e.g., '2025-01-01'). " +
                        "Must be after 2002-01-02 when NBP digital records begin."
                    ),

                endDate: z.string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/)
                    .describe(
                        "End date in YYYY-MM-DD format (e.g., '2025-03-31'). " +
                        "Must be after startDate and within 93 days of startDate (NBP API limit)."
                    ),
            },
            async ({ currencyCode, startDate, endDate }) => {
                // Validate date range (before token checking - don't charge for invalid input)
                const start = new Date(startDate);
                const end = new Date(endDate);
                const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

                if (daysDiff > 93) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: "Error: Date range exceeds maximum of 93 days. Please reduce the range."
                        }],
                        isError: true
                    };
                }

                if (daysDiff < 0) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: "Error: End date must be after start date."
                        }],
                        isError: true
                    };
                }

                const TOOL_COST = 1; // All NBP tools cost 1 token
                const TOOL_NAME = "getCurrencyHistory";

                // 0. Pre-generate action_id for idempotency
                const actionId = crypto.randomUUID();

                try {
                    // 1. Get user ID from props (set during OAuth)
                    const userId = this.props?.userId;
                    if (!userId) {
                        throw new Error("User ID not found in authentication context");
                    }

                    // 2. Check token balance (ALWAYS query database for current balance)
                    const balanceCheck = await checkBalance(this.env.DB, userId, TOOL_COST);

                    // 3a. UX IMPROVEMENT: If account deleted, show specific error message
                    if (balanceCheck.userDeleted) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: formatAccountDeletedError(TOOL_NAME)
                            }],
                            isError: true
                        };
                    }

                    // 3b. If insufficient balance, return error message in Polish
                    if (!balanceCheck.sufficient) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST)
                            }],
                            isError: true
                        };
                    }

                    // 4. Execute the NBP API call and capture result
                    const result = await fetchCurrencyHistory(currencyCode, startDate, endDate);

                    // 5. Consume tokens WITH RETRY and idempotency protection
                    await consumeTokensWithRetry(
                        this.env.DB,
                        userId,
                        TOOL_COST,
                        "nbp-exchange-mcp",
                        TOOL_NAME,
                        { currencyCode, startDate, endDate },  // action params
                        result,                                 // action result - logged for audit
                        true,                                   // success flag
                        actionId                                // pre-generated for idempotency
                    );

                    // 6. Return successful result
                    return {
                        content: [{
                            type: "text" as const,
                            text: JSON.stringify(result, null, 2)
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`
                        }],
                        isError: true
                    };
                }
            }
        );
    }
}
