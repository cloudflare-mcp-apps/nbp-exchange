/**
 * Centralized Tool Descriptions for NBP Exchange MCP Server
 *
 * These descriptions follow the 2-Part Structure from TOOL_DESCRIPTION_DESIGN_GUIDE.md:
 * [Action Verb + Functionality] → [Returns + Use Case + Constraints]
 *
 * CRITICAL: These constants are shared between OAuth and API key paths
 * to ensure dual-auth consistency (identical descriptions across all paths).
 *
 * Quality Checklist:
 * - ✅ 2-part structure (Purpose → Details)
 * - ✅ Starts with action verb ("Get")
 * - ✅ NBP mentioned (official government source - allowed)
 * - ✅ Use cases ("Use this when...", "Useful for...")
 * - ✅ Constraints surfaced ("Note:", "IMPORTANT:")
 */

export const TOOL_DESCRIPTIONS = {
    getCurrencyRate: {
        title: "Get Currency Exchange Rate",
        description:
            "Get current or historical buy/sell exchange rates for a specific currency from the Polish National Bank (NBP). " +
            "Returns bid (bank buy) and ask (bank sell) prices in Polish Zloty (PLN) from NBP Table C. " +
            "Use this when you need to know how much a currency costs to exchange at Polish banks. " +
            "Note: NBP only publishes rates on trading days (Mon-Fri, excluding Polish holidays).",
    },

    getGoldPrice: {
        title: "Get Gold Price",
        description:
            "Get the official price of 1 gram of gold (1000 millesimal fineness) in Polish Zloty (PLN) " +
            "as calculated and published by the Polish National Bank (NBP). " +
            "Use this for investment analysis, comparing gold prices over time, or checking current gold valuation. " +
            "Note: Prices are only published on trading days (Mon-Fri, excluding holidays). " +
            "Historical data available from January 2, 2013 onwards.",
    },

    getCurrencyHistory: {
        title: "Get Currency History",
        description:
            "Get a time series of historical exchange rates for a currency over a date range. " +
            "Returns buy/sell rates (bid/ask) in PLN for each trading day within the specified period. " +
            "Useful for analyzing currency trends, calculating average rates, or comparing rates across months. " +
            "IMPORTANT: NBP API limit is maximum 93 days per query. Only trading days are included (weekends/holidays are skipped).",
    },
} as const;

/**
 * Type helper for tool names
 */
export type ToolName = keyof typeof TOOL_DESCRIPTIONS;
