/**
 * Generic Tool Executor for NBP Exchange MCP Server
 *
 * Implements the complete 7-step token consumption workflow ONCE,
 * eliminating 90% of boilerplate code across all tools.
 *
 * 7-Step Pattern:
 * 1. Generate action ID for idempotency
 * 2. Check user balance
 * 3a. Handle account deletion
 * 3b. Handle insufficient balance
 * 4. Execute business logic
 * 4.5. Security processing (sanitize + redact PII)
 * 5. Consume tokens with retry & idempotency
 * 6. Return structured response
 * 7. Error handling
 */

import { checkBalance, consumeTokensWithRetry } from "./tokenConsumption";
import { formatInsufficientTokensError, formatAccountDeletedError } from "./tokenUtils";
import { sanitizeOutput, redactPII } from "pilpat-mcp-security";
import { logger } from "./logger";

/**
 * Execute a tool with automatic token consumption and security processing
 *
 * @template TInput - Tool input type
 * @template TOutput - Tool output type
 * @param params - Execution parameters
 * @returns MCP tool response with content and structuredContent
 */
export async function executeToolWithTokenConsumption<TInput, TOutput>(
    params: {
        /** Tool name for logging and error messages */
        toolName: string;
        /** Number of tokens to consume */
        toolCost: number;
        /** Authenticated user ID */
        userId: string;
        /** D1 database for token management */
        tokenDb: D1Database;
        /** Tool input parameters */
        inputs: TInput & Record<string, any>;
        /** Business logic function to execute */
        execute: (inputs: TInput) => Promise<TOutput>;
        /** Optional sanitization configuration */
        sanitizationOptions?: {
            /** Maximum output length (default: 5000 chars) */
            maxLength?: number;
            /** Redact email addresses (default: false for business use case) */
            redactEmails?: boolean;
        };
    }
): Promise<{ content: any[]; structuredContent?: TOutput; isError?: boolean }> {
    const { toolName, toolCost, userId, tokenDb, inputs, execute, sanitizationOptions } = params;

    // Step 1: Generate action ID for idempotency
    const actionId = crypto.randomUUID();

    try {
        // Step 2: Check balance
        const balanceCheck = await checkBalance(tokenDb, userId, toolCost);

        // Step 3a: Handle account deletion
        if (balanceCheck.userDeleted) {
            return {
                content: [{
                    type: "text",
                    text: formatAccountDeletedError(toolName)
                }],
                isError: true
            };
        }

        // Step 3b: Handle insufficient balance
        if (!balanceCheck.sufficient) {
            return {
                content: [{
                    type: "text",
                    text: formatInsufficientTokensError(toolName, balanceCheck.currentBalance, toolCost)
                }],
                isError: true
            };
        }

        // Step 4: Execute business logic
        const result = await execute(inputs);

        // Step 4.5: Security processing (sanitize + redact PII)
        const sanitized = sanitizeOutput(JSON.stringify(result, null, 2), {
            removeHtml: true,
            removeControlChars: true,
            normalizeWhitespace: true,
            maxLength: sanitizationOptions?.maxLength || 5000
        });

        const { redacted, detectedPII } = redactPII(sanitized, {
            redactEmails: sanitizationOptions?.redactEmails ?? false, // Business context - preserve emails by default
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
            logger.warn({ event: "pii_redacted", tool: toolName, pii_types: detectedPII, count: detectedPII.length });
        }

        const secureResult = JSON.parse(redacted) as TOutput;

        // Step 5: Consume tokens with retry & idempotency
        await consumeTokensWithRetry(
            tokenDb,
            userId,
            toolCost,
            "nbp-exchange-mcp",
            toolName,
            inputs,
            redacted,      // Store sanitized & redacted result for audit
            true,          // success flag
            actionId       // pre-generated for idempotency
        );

        // Step 6: Return structured response
        return {
            content: [{
                type: "text" as const,
                text: redacted
            }],
            structuredContent: secureResult
        };
    } catch (error) {
        // Step 7: Error handling
        logger.error({ event: "tool_failed", tool: toolName, error: String(error) });
        return {
            content: [{
                type: "text" as const,
                text: `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
        };
    }
}
