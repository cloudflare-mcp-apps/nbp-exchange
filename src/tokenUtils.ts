/**
 * Token Management Utilities for NBP MCP Server
 *
 * This module provides local utility functions for:
 * 1. Querying user information from shared token database
 * 2. Formatting error messages in Polish
 * 3. Rendering error pages for unauthorized users
 *
 * CRITICAL PRINCIPLE: Always query database for current balance. Never cache.
 *
 * Database Schema (from mcp-token-system):
 * - users: user_id, email, current_token_balance, total_tokens_used, total_tokens_purchased
 * - transactions: transaction_id, user_id, type, token_amount, balance_after, description, created_at
 * - mcp_actions: action_id, user_id, mcp_server_name, tool_name, parameters, tokens_consumed, success, created_at
 *
 * NOTE: Token consumption logic has been moved to tokenConsumption.ts module.
 * Use checkBalance() and consumeTokensWithRetry() from that module instead.
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

        console.log(`[NBP Token Utils] User found: ${result.user_id}, balance: ${result.current_token_balance} tokens`);
        return result;
    } catch (error) {
        console.error('[NBP Token Utils] Error querying user by email:', error);
        throw new Error('Failed to query user from database');
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
