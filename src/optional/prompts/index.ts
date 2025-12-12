/**
 * NBP Exchange MCP Server - Prompt Definitions
 *
 * Prompts provide reusable workflow templates that guide LLM interactions.
 * These prompts follow the pattern: First prompt = core function, subsequent = enhanced workflows
 *
 * Modularized following skeleton-ideal pattern for easier maintenance and updates.
 */

import * as z from "zod/v4";

/**
 * Prompt 1: Core Function - Direct rate retrieval (simple, foundational)
 *
 * Guides the LLM to retrieve official NBP exchange rates with proper explanation
 * of BID/ASK rates and trading day limitations.
 */
export const getExchangeRatePrompt = {
    name: "get_exchange_rate",
    config: {
        title: "Get Exchange Rate",
        description: "Get current or historical PLN exchange rate for a specific currency",
        argsSchema: {
            currency: z.enum([
                "USD", "EUR", "GBP", "CHF", "AUD", "CAD",
                "SEK", "NOK", "DKK", "JPY", "CZK", "HUF"
            ]).meta({ description: "Three-letter currency code (e.g., USD, EUR, GBP)" }),
            date: z.string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .optional()
                .meta({ description: "Optional date in YYYY-MM-DD format. Omit for most recent rate" })
        }
    },
    handler: async ({ currency, date }: { currency: string; date?: string }) => {
        const dateContext = date
            ? `for the date ${date}`
            : `for the most recent trading day`;

        return {
            description: `Get ${currency} exchange rate ${date ? 'on ' + date : '(current)'}`,
            messages: [
                {
                    role: "user" as const,
                    content: {
                        type: "text" as const,
                        text: `Please retrieve the official Polish National Bank (NBP) exchange rate for ${currency} ${dateContext}.

**Transaction Details:**
- Currency: ${currency}
- Date: ${date || 'not specified (use most recent)'}

**Expected Response:**
The response should include:
- **BID rate**: Bank's buying price in PLN (what you RECEIVE when selling foreign currency)
- **ASK rate**: Bank's selling price in PLN (what you PAY when buying foreign currency)
- Trading date and effective date

**Important Notes:**
- NBP only publishes rates on trading days (Mon-Fri, excluding Polish holidays)
- If the requested date falls on a weekend/holiday, you'll receive an error indicating no data is available
- This query costs 1 token

Please format the response clearly with the BID and ASK rates.`
                    }
                }
            ]
        };
    }
};

/**
 * Prompt 2: Enhanced Workflow - Calculate exchange cost with BID/ASK guidance
 *
 * Guides the LLM through a complete exchange cost calculation workflow,
 * including rate selection (BID vs ASK), formula application, and result presentation.
 */
export const calculateExchangeCostPrompt = {
    name: "calculate_exchange_cost",
    config: {
        title: "Calculate Exchange Cost",
        description: "Calculate the cost of exchanging money between PLN and a foreign currency",
        argsSchema: {
            currency: z.enum([
                "USD", "EUR", "GBP", "CHF", "AUD", "CAD",
                "SEK", "NOK", "DKK", "JPY", "CZK", "HUF"
            ]).meta({ description: "Three-letter currency code" }),
            amount: z.string()
                .meta({ description: "Amount to exchange (e.g., '100', '500.50')" }),
            direction: z.enum(["buying", "selling"])
                .meta({ description: "'buying' = you buy foreign currency (use ASK rate), 'selling' = you sell foreign currency (use BID rate)" }),
            date: z.string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .optional()
                .meta({ description: "Optional date in YYYY-MM-DD format. Omit for current rate" })
        }
    },
    handler: async ({ currency, amount, direction, date }: { currency: string; amount: string; direction: string; date?: string }) => {
        // Validate amount is a positive number
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            throw new Error(`Invalid amount: "${amount}". Must be a positive number (e.g., "100" or "500.50")`);
        }

        const rateTypeExplanation = direction === "buying"
            ? "ASK rate (the price you PAY to buy foreign currency)"
            : "BID rate (the price you RECEIVE when selling foreign currency)";

        const dateContext = date
            ? `using the exchange rate from ${date}`
            : `using the most recent exchange rate`;

        const calculationFormula = direction === "buying"
            ? `Total PLN cost = ${amount} × ASK rate`
            : `Total PLN received = ${amount} × BID rate`;

        const resultFormat = direction === "buying"
            ? `"Buying ${amount} ${currency} will cost [result] PLN"`
            : `"Selling ${amount} ${currency} will get you [result] PLN"`;

        return {
            description: `Calculate exchange cost for ${amount} ${currency} (${direction})`,
            messages: [
                {
                    role: "user" as const,
                    content: {
                        type: "text" as const,
                        text: `Calculate the total cost in Polish Zloty (PLN) for this currency exchange:

**Transaction Details:**
- Currency: ${currency}
- Amount: ${amount} ${currency}
- Direction: ${direction} (you are ${direction === "buying" ? "buying foreign currency with PLN" : "selling foreign currency for PLN"})
- Date: ${date || 'not specified (use current rate)'}

**Instructions:**
1. First, retrieve the NBP exchange rate for ${currency} ${dateContext}
2. Use the ${rateTypeExplanation}
3. Calculate: ${calculationFormula}
4. Present as: ${resultFormat}
5. Show the breakdown: amount × rate = total PLN

**Rate Type Guide:**
- **ASK rate**: Bank's selling price (you pay MORE when buying foreign currency from the bank)
- **BID rate**: Bank's buying price (you receive LESS when selling foreign currency to the bank)
- The bank always profits from the spread between BID and ASK rates

**Example Calculations:**
- If you're BUYING 100 USD and ASK rate is 4.00 PLN: Cost = 100 × 4.00 = 400 PLN
- If you're SELLING 100 USD and BID rate is 3.90 PLN: You receive = 100 × 3.90 = 390 PLN

**Trading Day Note:**
NBP only publishes rates on Mon-Fri (excluding Polish holidays). Weekend/holiday requests will fail.

⚠️ This calculation costs 1 token (for the rate retrieval).

Please retrieve the rate and calculate the total PLN amount clearly.`
                    }
                }
            ]
        };
    }
};

/**
 * Export all prompts for registration in server
 *
 * Usage in server.ts:
 * ```typescript
 * import { nbpPrompts } from "./optional/prompts";
 *
 * async init() {
 *     for (const prompt of nbpPrompts) {
 *         this.server.registerPrompt(prompt.name, prompt.config, prompt.handler);
 *     }
 * }
 * ```
 */
export const nbpPrompts = [
    getExchangeRatePrompt,
    calculateExchangeCostPrompt
];
