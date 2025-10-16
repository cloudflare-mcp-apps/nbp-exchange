/**
 * Token Management Utilities for NBP MCP Server
 *
 * This module provides functions for:
 * 1. Querying user information from shared token database
 * 2. Checking token balances before tool execution
 * 3. Deducting tokens atomically with transaction logging
 * 4. Formatting error messages in Polish
 *
 * CRITICAL PRINCIPLE: Always query database for current balance. Never cache.
 *
 * Database Schema (from mcp-token-system):
 * - users: user_id, email, current_token_balance, total_tokens_used, total_tokens_purchased
 * - transactions: transaction_id, user_id, type, token_amount, balance_after, description, created_at
 * - mcp_actions: action_id, user_id, mcp_server_name, tool_name, parameters, tokens_consumed, success, created_at
 */

/**
 * Database user record from mcp-tokens-database
 */
export interface DatabaseUser {
    user_id: string;
    email: string;
    current_token_balance: number;
    total_tokens_purchased: number;
    total_tokens_used: number;
    stripe_customer_id: string | null;
    created_at: string;
}

/**
 * Result of token balance check
 */
export interface BalanceCheckResult {
    sufficient: boolean;
    currentBalance: number;
    required: number;
}

/**
 * Result of token deduction operation
 */
export interface TokenDeductionResult {
    success: boolean;
    newBalance: number;
    transactionId: string;
    actionId: string;
}

/**
 * Query user from database by email address
 *
 * @param db - D1 Database instance
 * @param email - User's email address (from WorkOS authentication)
 * @returns User record if found, null otherwise
 */
export async function getUserByEmail(
    db: D1Database,
    email: string
): Promise<DatabaseUser | null> {
    try {
        console.log(`[NBP Token Utils] Querying user by email: ${email}`);

        const result = await db
            .prepare('SELECT * FROM users WHERE email = ?')
            .bind(email)
            .first<DatabaseUser>();

        if (!result) {
            console.log(`[NBP Token Utils] User not found in database: ${email}`);
            return null;
        }

        console.log(`[NBP Token Utils] User found: ${result.user_id}, balance: ${result.current_token_balance}`);
        return result;
    } catch (error) {
        console.error('[NBP Token Utils] Error querying user by email:', error);
        throw new Error('Failed to query user from database');
    }
}

/**
 * Check if user has sufficient token balance
 *
 * This is a READ-ONLY check that does NOT deduct tokens.
 * Always queries database for current balance - never uses cached values.
 *
 * @param db - D1 Database instance
 * @param userId - User's UUID from database
 * @param requiredTokens - Number of tokens required for the action
 * @returns Balance check result with sufficient flag and current balance
 */
export async function checkTokenBalance(
    db: D1Database,
    userId: string,
    requiredTokens: number
): Promise<BalanceCheckResult> {
    try {
        // Query database for current balance (NEVER use cached value)
        const result = await db
            .prepare('SELECT current_token_balance FROM users WHERE user_id = ?')
            .bind(userId)
            .first<{ current_token_balance: number }>();

        if (!result) {
            console.error(`[NBP Token Utils] User not found during balance check: ${userId}`);
            return {
                sufficient: false,
                currentBalance: 0,
                required: requiredTokens,
            };
        }

        const currentBalance = result.current_token_balance;
        const sufficient = currentBalance >= requiredTokens;

        console.log(
            `[NBP Token Utils] Balance check: user ${userId} has ${currentBalance} tokens, needs ${requiredTokens}, sufficient: ${sufficient}`
        );

        return {
            sufficient,
            currentBalance,
            required: requiredTokens,
        };
    } catch (error) {
        console.error('[NBP Token Utils] Error checking balance:', error);
        throw new Error('Failed to check token balance');
    }
}

/**
 * Deduct tokens atomically with transaction logging
 *
 * Performs an atomic transaction that:
 * 1. Deducts tokens from user's balance
 * 2. Creates a transaction record (type='usage')
 * 3. Logs the MCP action with tool details
 *
 * All three operations succeed together or fail together.
 *
 * @param db - D1 Database instance
 * @param userId - User's UUID
 * @param tokenAmount - Number of tokens to deduct (positive number)
 * @param serverName - Name of this MCP server (e.g., 'nbp-exchange-mcp')
 * @param toolName - Name of the tool executed (e.g., 'getCurrencyRate')
 * @param actionParams - Parameters passed to the tool (for logging)
 * @returns Token deduction result with new balance and IDs
 */
export async function deductTokens(
    db: D1Database,
    userId: string,
    tokenAmount: number,
    serverName: string,
    toolName: string,
    actionParams: Record<string, unknown> = {}
): Promise<TokenDeductionResult> {
    try {
        // Generate unique IDs for transaction and action records
        const transactionId = crypto.randomUUID();
        const actionId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        // Validate inputs
        if (tokenAmount <= 0) {
            throw new Error('Token amount must be positive');
        }

        if (!userId || !serverName || !toolName) {
            throw new Error('Missing required parameters');
        }

        console.log(
            `[NBP Token Utils] Deducting ${tokenAmount} tokens for user ${userId}, server: ${serverName}, tool: ${toolName}`
        );

        // Store action parameters as JSON
        const parametersJson = JSON.stringify(actionParams);

        // Atomic transaction: All three operations must succeed together
        const batchResult = await db.batch([
            // 1. Update user balance and total tokens used
            db.prepare(`
                UPDATE users
                SET
                    current_token_balance = current_token_balance - ?,
                    total_tokens_used = total_tokens_used + ?
                WHERE user_id = ?
            `).bind(tokenAmount, tokenAmount, userId),

            // 2. Create transaction record (negative amount for usage)
            db.prepare(`
                INSERT INTO transactions (
                    transaction_id,
                    user_id,
                    type,
                    token_amount,
                    balance_after,
                    description,
                    created_at
                )
                VALUES (?, ?, 'usage', ?,
                    (SELECT current_token_balance FROM users WHERE user_id = ?),
                    ?, ?)
            `).bind(
                transactionId,
                userId,
                -tokenAmount, // Negative for usage
                userId,
                `${serverName}: ${toolName}`,
                timestamp
            ),

            // 3. Log MCP action with full details
            db.prepare(`
                INSERT INTO mcp_actions (
                    action_id,
                    user_id,
                    mcp_server_name,
                    tool_name,
                    parameters,
                    tokens_consumed,
                    success,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                actionId,
                userId,
                serverName,
                toolName,
                parametersJson,
                tokenAmount,
                1, // success = true (we only deduct after successful execution)
                timestamp
            ),
        ]);

        // Verify all operations succeeded
        if (!batchResult || batchResult.length !== 3) {
            throw new Error('Batch transaction failed');
        }

        // Check if user update affected any rows
        if (batchResult[0].meta.changes === 0) {
            throw new Error('User not found or balance update failed');
        }

        // Query updated balance
        const balanceResult = await db
            .prepare('SELECT current_token_balance FROM users WHERE user_id = ?')
            .bind(userId)
            .first<{ current_token_balance: number }>();

        if (!balanceResult) {
            throw new Error('Failed to retrieve updated balance');
        }

        const newBalance = balanceResult.current_token_balance;

        console.log(
            `[NBP Token Utils] ✅ Success! User ${userId}: ${newBalance + tokenAmount} → ${newBalance} tokens`
        );

        return {
            success: true,
            newBalance,
            transactionId,
            actionId,
        };
    } catch (error) {
        console.error('[NBP Token Utils] ❌ Error deducting tokens:', error);
        console.error({
            userId,
            tokenAmount,
            serverName,
            toolName,
            error: error instanceof Error ? error.message : String(error),
        });

        throw new Error('Failed to deduct tokens: ' + (error instanceof Error ? error.message : String(error)));
    }
}

/**
 * Format insufficient tokens error message in Polish
 *
 * Creates a user-friendly error message with:
 * - Tool name that requires tokens
 * - Current balance
 * - Required tokens
 * - Link to purchase more tokens
 *
 * @param toolName - Name of the tool that requires tokens
 * @param currentBalance - User's current token balance
 * @param requiredTokens - Number of tokens required
 * @returns Formatted error message in Polish
 */
export function formatInsufficientTokensError(
    toolName: string,
    currentBalance: number,
    requiredTokens: number
): string {
    const tokenWord = currentBalance === 1 ? 'token' : (currentBalance === 0 || currentBalance >= 5 ? 'tokenów' : 'tokeny');
    const requiredWord = requiredTokens === 1 ? 'token' : (requiredTokens >= 5 ? 'tokenów' : 'tokeny');

    return `Niewystarczająca liczba tokenów do wykonania ${toolName}.
Aktualny stan: ${currentBalance} ${tokenWord}
Wymagane: ${requiredTokens} ${requiredWord}
Kup tokeny: https://panel.wtyczki.ai/`;
}

/**
 * Format error page HTML for users not in database
 *
 * Creates an HTML error page for users who authenticated via WorkOS
 * but don't have tokens in the database (never purchased).
 *
 * @param userEmail - User's email address
 * @returns HTML error page
 */
export function formatPurchaseRequiredPage(userEmail: string): string {
    return `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wymagane tokeny - NBP Exchange MCP</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            text-align: center;
            background: #f5f5f5;
        }
        .error-box {
            background: white;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #e74c3c;
            margin-bottom: 20px;
        }
        p {
            color: #555;
            line-height: 1.6;
            margin-bottom: 30px;
        }
        .email {
            font-weight: bold;
            color: #2c3e50;
        }
        .purchase-button {
            display: inline-block;
            background: #3498db;
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            transition: background 0.3s;
        }
        .purchase-button:hover {
            background: #2980b9;
        }
    </style>
</head>
<body>
    <div class="error-box">
        <h1>🔒 Wymagane tokeny</h1>
        <p>
            Aby korzystać z serwera NBP Exchange MCP, musisz najpierw kupić tokeny.
        </p>
        <p>
            Twój email: <span class="email">${userEmail}</span>
        </p>
        <p>
            Po zakupie tokenów będziesz mógł korzystać z wszystkich narzędzi MCP.
        </p>
        <a href="https://panel.wtyczki.ai/" class="purchase-button">
            Kup tokeny
        </a>
    </div>
</body>
</html>`;
}
