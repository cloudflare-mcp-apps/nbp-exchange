/**
 * Input Schemas for NBP Exchange MCP Server Tools
 *
 * Centralized Zod schema definitions for tool input validation.
 * These schemas provide type safety, validation, and documentation.
 */

import * as z from "zod/v4";

/**
 * Input schema for getCurrencyRate tool (1 token)
 *
 * Retrieves current or historical exchange rates for a specific currency
 */
export const GetCurrencyRateInput = z.object({
    currencyCode: z.enum([
        "USD", "EUR", "GBP", "CHF", "AUD", "CAD",
        "SEK", "NOK", "DKK", "JPY", "CZK", "HUF"
    ]).meta({ description:        "Three-letter ISO 4217 currency code (uppercase). " +
        "Supported currencies: USD, EUR, GBP, CHF, AUD, CAD, SEK, NOK, DKK, JPY, CZK, HUF"
    }),

    date: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .meta({ description:            "Optional: Specific date in YYYY-MM-DD format (e.g., '2025-10-01'). " +
            "If omitted, returns the most recent available rate. " +
            "Must be a trading day (not weekend/holiday) or you'll get a 404 error."
        }),
});

/**
 * Input schema for getGoldPrice tool (1 token)
 *
 * Retrieves official gold price per gram in PLN
 */
export const GetGoldPriceInput = z.object({
    date: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .meta({ description:            "Optional: Specific date in YYYY-MM-DD format (e.g., '2025-10-01'). " +
            "If omitted, returns the most recent available gold price. " +
            "Must be a trading day after 2013-01-02, or you'll get a 404 error."
        }),
});

/**
 * Input schema for getCurrencyHistory tool (1 token)
 *
 * Retrieves historical exchange rate series over a date range
 */
export const GetCurrencyHistoryInput = z.object({
    currencyCode: z.enum([
        "USD", "EUR", "GBP", "CHF", "AUD", "CAD",
        "SEK", "NOK", "DKK", "JPY", "CZK", "HUF"
    ]).meta({ description:        "Three-letter ISO 4217 currency code (uppercase). " +
        "Supported currencies: USD, EUR, GBP, CHF, AUD, CAD, SEK, NOK, DKK, JPY, CZK, HUF"
    }),

    startDate: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .meta({ description:            "Start date in YYYY-MM-DD format (e.g., '2025-01-01'). " +
            "Must be after 2002-01-02 when NBP digital records begin."
        }),

    endDate: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .meta({ description:            "End date in YYYY-MM-DD format (e.g., '2025-03-31'). " +
            "Must be after startDate and within 93 days of startDate (NBP API limit)."
        }),
});

// Type inference from schemas
export type GetCurrencyRateParams = z.infer<typeof GetCurrencyRateInput>;
export type GetGoldPriceParams = z.infer<typeof GetGoldPriceInput>;
export type GetCurrencyHistoryParams = z.infer<typeof GetCurrencyHistoryInput>;
