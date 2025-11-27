import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchCurrencyRate, fetchGoldPrice, fetchCurrencyHistory } from "./nbp-client";
import type { Env } from "./types";
import type { Props } from "./props";
import { checkBalance, consumeTokensWithRetry } from "./tokenConsumption";
import { formatInsufficientTokensError, formatAccountDeletedError } from "./tokenUtils";
import { sanitizeOutput, redactPII } from 'pilpat-mcp-security';

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
        // ========================================================================
        // PROMPT REGISTRATION SECTION
        // ========================================================================
        // Prompts provide reusable workflow templates that guide LLM interactions
        // They follow the pattern: First prompt = core function, subsequent = enhanced workflows

        // Prompt 1: Core Function - Direct rate retrieval (simple, foundational)
        this.server.registerPrompt(
            "get_exchange_rate",
            {
                title: "Get Exchange Rate",
                description: "Get current or historical PLN exchange rate for a specific currency",
                argsSchema: {
                    currency: z.enum([
                        "USD", "EUR", "GBP", "CHF", "AUD", "CAD",
                        "SEK", "NOK", "DKK", "JPY", "CZK", "HUF"
                    ]).describe("Three-letter currency code (e.g., USD, EUR, GBP)"),
                    date: z.string()
                        .regex(/^\d{4}-\d{2}-\d{2}$/)
                        .optional()
                        .describe("Optional date in YYYY-MM-DD format. Omit for most recent rate")
                }
            },
            async ({ currency, date }) => {
                const dateContext = date
                    ? `for the date ${date}`
                    : `for the most recent trading day`;

                return {
                    description: `Get ${currency} exchange rate ${date ? 'on ' + date : '(current)'}`,
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
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
        );

        // Prompt 2: Enhanced Workflow - Calculate exchange cost with BID/ASK guidance
        this.server.registerPrompt(
            "calculate_exchange_cost",
            {
                title: "Calculate Exchange Cost",
                description: "Calculate the cost of exchanging money between PLN and a foreign currency",
                argsSchema: {
                    currency: z.enum([
                        "USD", "EUR", "GBP", "CHF", "AUD", "CAD",
                        "SEK", "NOK", "DKK", "JPY", "CZK", "HUF"
                    ]).describe("Three-letter currency code"),
                    amount: z.string()
                        .describe("Amount to exchange (e.g., '100', '500.50')"),
                    direction: z.enum(["buying", "selling"])
                        .describe("'buying' = you buy foreign currency (use ASK rate), 'selling' = you sell foreign currency (use BID rate)"),
                    date: z.string()
                        .regex(/^\d{4}-\d{2}-\d{2}$/)
                        .optional()
                        .describe("Optional date in YYYY-MM-DD format. Omit for current rate")
                }
            },
            async ({ currency, amount, direction, date }) => {
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
                            role: "user",
                            content: {
                                type: "text",
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
        );

        // ========================================================================
        // TOOL REGISTRATION SECTION
        // ========================================================================

        // Tool 1: Get current or historical currency rate (Costs 1 token)
        this.server.registerTool(
            "getCurrencyRate",
            {
                title: "Get Currency Exchange Rate",
                description: "Get current or historical buy/sell exchange rates for a specific currency from the Polish National Bank (NBP). " +
                    "Returns bid (bank buy) and ask (bank sell) prices in Polish Zloty (PLN) from NBP Table C. " +
                    "Use this when you need to know how much a currency costs to exchange at Polish banks. " +
                    "Note: NBP only publishes rates on trading days (Mon-Fri, excluding Polish holidays). ",
                inputSchema: {
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
                outputSchema: {
                    table: z.string(),
                    currency: z.string(),
                    code: z.string(),
                    bid: z.number(),
                    ask: z.number(),
                    tradingDate: z.string(),
                    effectiveDate: z.string(),
                }
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
                    const balanceCheck = await checkBalance(this.env.TOKEN_DB, userId, TOOL_COST);

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

                    // 4.5. Security Processing (Phase 2)
                    const sanitized = sanitizeOutput(JSON.stringify(result, null, 2), {
                        removeHtml: true,
                        removeControlChars: true,
                        normalizeWhitespace: true,
                        maxLength: 5000
                    });

                    const { redacted, detectedPII } = redactPII(sanitized, {
                        redactEmails: false,           // v1.1.0+ default (business use case)
                        redactPhones: true,
                        redactCreditCards: true,
                        redactSSN: true,
                        redactBankAccounts: true,
                        redactPESEL: true,             // Polish national ID
                        redactPolishIdCard: true,      // Polish ID card
                        redactPolishPassport: true,    // Polish passport
                        redactPolishPhones: true,      // Polish phone numbers
                        placeholder: '[REDACTED]'
                    });

                    if (detectedPII.length > 0) {
                        console.warn(`[Security] Tool ${TOOL_NAME}: Redacted PII types:`, detectedPII);
                    }

                    const finalResult = redacted;

                    // 5. Consume tokens WITH RETRY and idempotency protection
                    await consumeTokensWithRetry(
                        this.env.TOKEN_DB,
                        userId,
                        TOOL_COST,
                        "nbp-exchange-mcp",
                        TOOL_NAME,
                        { currencyCode, date },  // action params
                        finalResult,              // action result - sanitized & redacted for audit
                        true,                     // success flag
                        actionId                  // pre-generated for idempotency
                    );

                    // 6. Return successful result (sanitized & redacted)
                    const resultObject = JSON.parse(finalResult);
                    return {
                        content: [{
                            type: "text" as const,
                            text: finalResult
                        }],
                        structuredContent: resultObject
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
        this.server.registerTool(
            "getGoldPrice",
            {
                title: "Get Gold Price",
                description: "Get the official price of 1 gram of gold (1000 millesimal fineness) in Polish Zloty (PLN) " +
                    "as calculated and published by the Polish National Bank (NBP). " +
                    "Use this for investment analysis, comparing gold prices over time, or checking current gold valuation. " +
                    "Note: Prices are only published on trading days (Mon-Fri, excluding holidays). " +
                    "Historical data available from January 2, 2013 onwards. ",
                inputSchema: {
                    date: z.string()
                        .regex(/^\d{4}-\d{2}-\d{2}$/)
                        .optional()
                        .describe(
                            "Optional: Specific date in YYYY-MM-DD format (e.g., '2025-10-01'). " +
                            "If omitted, returns the most recent available gold price. " +
                            "Must be a trading day after 2013-01-02, or you'll get a 404 error."
                        ),
                },
                outputSchema: {
                    date: z.string(),
                    price: z.number(),
                }
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
                    const balanceCheck = await checkBalance(this.env.TOKEN_DB, userId, TOOL_COST);

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

                    // 4.5. Security Processing (Phase 2)
                    const sanitized = sanitizeOutput(JSON.stringify(result, null, 2), {
                        removeHtml: true,
                        removeControlChars: true,
                        normalizeWhitespace: true,
                        maxLength: 5000
                    });

                    const { redacted, detectedPII } = redactPII(sanitized, {
                        redactEmails: false,           // v1.1.0+ default (business use case)
                        redactPhones: true,
                        redactCreditCards: true,
                        redactSSN: true,
                        redactBankAccounts: true,
                        redactPESEL: true,             // Polish national ID
                        redactPolishIdCard: true,      // Polish ID card
                        redactPolishPassport: true,    // Polish passport
                        redactPolishPhones: true,      // Polish phone numbers
                        placeholder: '[REDACTED]'
                    });

                    if (detectedPII.length > 0) {
                        console.warn(`[Security] Tool ${TOOL_NAME}: Redacted PII types:`, detectedPII);
                    }

                    const finalResult = redacted;

                    // 5. Consume tokens WITH RETRY and idempotency protection
                    await consumeTokensWithRetry(
                        this.env.TOKEN_DB,
                        userId,
                        TOOL_COST,
                        "nbp-exchange-mcp",
                        TOOL_NAME,
                        { date },     // action params
                        finalResult,  // action result - sanitized & redacted for audit
                        true,         // success flag
                        actionId      // pre-generated for idempotency
                    );

                    // 6. Return successful result (sanitized & redacted)
                    const resultObject = JSON.parse(finalResult);
                    return {
                        content: [{
                            type: "text" as const,
                            text: finalResult
                        }],
                        structuredContent: resultObject
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
        this.server.registerTool(
            "getCurrencyHistory",
            {
                title: "Get Currency History",
                description: "Get a time series of historical exchange rates for a currency over a date range. " +
                    "Returns buy/sell rates (bid/ask) in PLN for each trading day within the specified period. " +
                    "Useful for analyzing currency trends, calculating average rates, or comparing rates across months. " +
                    "IMPORTANT: NBP API limit is maximum 93 days per query. Only trading days are included (weekends/holidays are skipped). ",
                inputSchema: {
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
                outputSchema: {
                    table: z.string(),
                    currency: z.string(),
                    code: z.string(),
                    rates: z.array(z.object({
                        tradingDate: z.string(),
                        effectiveDate: z.string(),
                        bid: z.number(),
                        ask: z.number(),
                    })),
                }
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
                    const balanceCheck = await checkBalance(this.env.TOKEN_DB, userId, TOOL_COST);

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

                    // 4.5. Security Processing (Phase 2)
                    const sanitized = sanitizeOutput(JSON.stringify(result, null, 2), {
                        removeHtml: true,
                        removeControlChars: true,
                        normalizeWhitespace: true,
                        maxLength: 5000
                    });

                    const { redacted, detectedPII } = redactPII(sanitized, {
                        redactEmails: false,           // v1.1.0+ default (business use case)
                        redactPhones: true,
                        redactCreditCards: true,
                        redactSSN: true,
                        redactBankAccounts: true,
                        redactPESEL: true,             // Polish national ID
                        redactPolishIdCard: true,      // Polish ID card
                        redactPolishPassport: true,    // Polish passport
                        redactPolishPhones: true,      // Polish phone numbers
                        placeholder: '[REDACTED]'
                    });

                    if (detectedPII.length > 0) {
                        console.warn(`[Security] Tool ${TOOL_NAME}: Redacted PII types:`, detectedPII);
                    }

                    const finalResult = redacted;

                    // 5. Consume tokens WITH RETRY and idempotency protection
                    await consumeTokensWithRetry(
                        this.env.TOKEN_DB,
                        userId,
                        TOOL_COST,
                        "nbp-exchange-mcp",
                        TOOL_NAME,
                        { currencyCode, startDate, endDate },  // action params
                        finalResult,                            // action result - sanitized & redacted for audit
                        true,                                   // success flag
                        actionId                                // pre-generated for idempotency
                    );

                    // 6. Return successful result (sanitized & redacted)
                    const resultObject = JSON.parse(finalResult);
                    return {
                        content: [{
                            type: "text" as const,
                            text: finalResult
                        }],
                        structuredContent: resultObject
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
