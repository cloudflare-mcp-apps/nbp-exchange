/**
 * Output Schemas for NBP Exchange MCP Server Tools
 *
 * Centralized Zod schema definitions for tool output validation.
 * These schemas provide type safety and structured content validation.
 */

import { z } from "zod";

/**
 * Output schema for getCurrencyRate tool
 *
 * Returns buy/sell exchange rates for a specific currency
 */
export const GetCurrencyRateOutputSchema = z.object({
    table: z.string().describe("NBP table identifier (e.g., 'C' for buy/sell rates)"),
    currency: z.string().describe("Full currency name (e.g., 'dolar amerykański')"),
    code: z.string().describe("Three-letter currency code (e.g., 'USD')"),
    bid: z.number().describe(
        "Bank's buying price in PLN (what you RECEIVE when selling foreign currency to the bank)"
    ),
    ask: z.number().describe(
        "Bank's selling price in PLN (what you PAY when buying foreign currency from the bank)"
    ),
    tradingDate: z.string().describe("Trading date in YYYY-MM-DD format"),
    effectiveDate: z.string().describe("Effective date in YYYY-MM-DD format"),
});

/**
 * Output schema for getGoldPrice tool
 *
 * Returns official gold price per gram in PLN
 */
export const GetGoldPriceOutputSchema = z.object({
    date: z.string().describe("Price publication date in YYYY-MM-DD format"),
    price: z.number().describe("Gold price in PLN per gram (1000 millesimal fineness)"),
});

/**
 * Output schema for getCurrencyHistory tool
 *
 * Returns historical exchange rate series
 */
export const GetCurrencyHistoryOutputSchema = z.object({
    table: z.string().describe("NBP table identifier (e.g., 'C' for buy/sell rates)"),
    currency: z.string().describe("Full currency name (e.g., 'dolar amerykański')"),
    code: z.string().describe("Three-letter currency code (e.g., 'USD')"),
    rates: z.array(z.object({
        tradingDate: z.string().describe("Trading date in YYYY-MM-DD format"),
        effectiveDate: z.string().describe("Effective date in YYYY-MM-DD format"),
        bid: z.number().describe("Bank's buying price in PLN"),
        ask: z.number().describe("Bank's selling price in PLN"),
    })).describe("Array of daily exchange rates within the requested date range"),
});

// Type inference from schemas
export type GetCurrencyRateResult = z.infer<typeof GetCurrencyRateOutputSchema>;
export type GetGoldPriceResult = z.infer<typeof GetGoldPriceOutputSchema>;
export type GetCurrencyHistoryResult = z.infer<typeof GetCurrencyHistoryOutputSchema>;
