import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchCurrencyRate, fetchGoldPrice, fetchCurrencyHistory } from "./nbp-client";
import type { Env } from "./types";
import type { Props } from "./props";

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
        // Tool 1: Get current or historical currency rate
        this.server.tool(
            "getCurrencyRate",
            "Get current or historical buy/sell exchange rates for a specific currency from the Polish National Bank (NBP). " +
            "Returns bid (bank buy) and ask (bank sell) prices in Polish Zloty (PLN) from NBP Table C. " +
            "Use this when you need to know how much a currency costs to exchange at Polish banks. " +
            "Note: NBP only publishes rates on trading days (Mon-Fri, excluding Polish holidays).",
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
                try {
                    const result = await fetchCurrencyRate(currencyCode, date);

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

        // Tool 2: Get gold price
        this.server.tool(
            "getGoldPrice",
            "Get the official price of 1 gram of gold (1000 millesimal fineness) in Polish Zloty (PLN) " +
            "as calculated and published by the Polish National Bank (NBP). " +
            "Use this for investment analysis, comparing gold prices over time, or checking current gold valuation. " +
            "Note: Prices are only published on trading days (Mon-Fri, excluding holidays). " +
            "Historical data available from January 2, 2013 onwards.",
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
                try {
                    const result = await fetchGoldPrice(date);

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

        // Tool 3: Get historical currency rate series
        this.server.tool(
            "getCurrencyHistory",
            "Get a time series of historical exchange rates for a currency over a date range. " +
            "Returns buy/sell rates (bid/ask) in PLN for each trading day within the specified period. " +
            "Useful for analyzing currency trends, calculating average rates, or comparing rates across months. " +
            "IMPORTANT: NBP API limit is maximum 93 days per query. Only trading days are included (weekends/holidays are skipped).",
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
                // Validate date range
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

                try {
                    const result = await fetchCurrencyHistory(currencyCode, startDate, endDate);

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
