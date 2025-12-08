/**
 * NBP Tool Extractors
 *
 * Extracted tool business logic for DRY (Don't Repeat Yourself) principle.
 * These functions handle complex validation logic before token consumption.
 *
 * Used by both OAuth (server.ts) and API key (api-key-handler.ts) paths.
 */

import type { Env } from "../types";
import type { GetCurrencyHistoryParams } from "../schemas/inputs";
import { fetchCurrencyHistory } from "../api-client";
import { checkBalance, consumeTokensWithRetry } from "../shared/tokenConsumption";
import { formatInsufficientTokensError, formatAccountDeletedError } from "../shared/tokenUtils";
import { sanitizeOutput, redactPII } from "pilpat-mcp-security";
import { logger } from "../shared/logger";

/**
 * Tool result interface for MCP protocol
 */
interface ToolResult {
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: any;
    isError?: boolean;
}

/**
 * Execute getCurrencyHistory tool with pre-validation
 *
 * This tool requires pre-validation before token consumption:
 * - Validates date range doesn't exceed 93 days (NBP API limit)
 * - Validates endDate is after startDate
 *
 * If validation fails, no tokens are consumed (user doesn't pay for invalid requests).
 *
 * @param params - Tool input parameters
 * @param env - Cloudflare environment bindings
 * @param userId - Authenticated user ID
 * @returns Tool result with status and data or error
 */
export async function executeGetCurrencyHistory(
    params: GetCurrencyHistoryParams,
    env: Env,
    userId: string
): Promise<ToolResult> {
    const TOOL_COST = 1;
    const TOOL_NAME = "getCurrencyHistory";
    const actionId = crypto.randomUUID();

    // PRE-VALIDATION (before token consumption)
    // This ensures users don't pay for invalid requests
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff > 93) {
        return {
            content: [{
                type: "text",
                text: "Error: Date range exceeds maximum of 93 days. Please reduce the range."
            }],
            isError: true
        };
    }

    if (daysDiff < 0) {
        return {
            content: [{
                type: "text",
                text: "Error: End date must be after start date."
            }],
            isError: true
        };
    }

    try {
        // Step 2: Check balance
        const balanceCheck = await checkBalance(env.TOKEN_DB, userId, TOOL_COST);

        // Step 3a: Handle account deletion
        if (balanceCheck.userDeleted) {
            return {
                content: [{
                    type: "text",
                    text: formatAccountDeletedError(TOOL_NAME)
                }],
                isError: true
            };
        }

        // Step 3b: Handle insufficient balance
        if (!balanceCheck.sufficient) {
            return {
                content: [{
                    type: "text",
                    text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST)
                }],
                isError: true
            };
        }

        // Step 4: Execute API call
        const result = await fetchCurrencyHistory(params.currencyCode, params.startDate, params.endDate);

        // Step 4.5: Security processing (sanitize + redact PII)
        const sanitized = sanitizeOutput(JSON.stringify(result, null, 2), {
            removeHtml: true,
            removeControlChars: true,
            normalizeWhitespace: true,
            maxLength: 10000  // Larger limit for historical data
        });

        const { redacted, detectedPII } = redactPII(sanitized, {
            redactEmails: false,           // Business context - preserve emails
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
            logger.warn({ event: "pii_redacted", tool: TOOL_NAME, pii_types: detectedPII, count: detectedPII.length });
        }

        const secureResult = JSON.parse(redacted);

        // Step 5: Consume tokens with retry & idempotency
        await consumeTokensWithRetry(
            env.TOKEN_DB,
            userId,
            TOOL_COST,
            "nbp-exchange-mcp",
            TOOL_NAME,
            params,
            redacted,  // Store sanitized & redacted result for audit
            true,      // success flag
            actionId   // pre-generated for idempotency
        );

        // Step 6: Return structured response
        return {
            content: [{
                type: "text",
                text: redacted
            }],
            structuredContent: secureResult
        };
    } catch (error) {
        // Step 7: Error handling
        logger.error({ event: "tool_failed", tool: TOOL_NAME, error: String(error) });
        return {
            content: [{
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
        };
    }
}
