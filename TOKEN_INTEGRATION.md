# Token System Integration Guide

## Overview

This document describes the integration pattern for connecting MCP servers to the centralized `mcp-token-system` for pay-per-use token consumption. This pattern was first implemented in the NBP Exchange MCP server and serves as a blueprint for integrating all future MCP servers.

## Architecture

### Shared Database Model (Option A)
- **Single D1 Database**: All MCP servers connect to the same shared database (`mcp-tokens-database`)
- **Direct Access**: Each MCP server queries and updates the database directly (no API layer)
- **Database ID**: `ebb389aa-2d65-4d38-a0da-50c7da9dfe8b`
- **Same WorkOS Application**: All servers use the same WorkOS credentials for authentication

### Authentication Flow

```
1. User connects to MCP server via client (Claude Desktop, Cursor, etc.)
2. OAuth redirect to WorkOS AuthKit (Magic Auth)
3. User enters email → receives 6-digit code
4. User enters code → WorkOS validates
5. OAuth callback checks if user exists in database (by email)
6. IF user NOT in database → Return 403 with purchase page
7. IF user IN database → Complete OAuth and grant access to tools
8. Tools check balance before execution and deduct tokens after success
```

### Token Consumption Flow

```
1. Tool invoked by AI agent
2. Get userId from this.props (set during OAuth)
3. Check token balance (ALWAYS query database - never cache)
4. IF insufficient → Return Polish error message
5. Execute tool logic (API call, computation, etc.)
6. Deduct tokens atomically with transaction logging
7. Return result to AI agent
```

## Database Schema

The shared database contains three main tables:

### `users` Table
```sql
- user_id (TEXT PRIMARY KEY) - UUID
- email (TEXT UNIQUE) - User email from WorkOS
- current_token_balance (INTEGER) - Current available tokens
- total_tokens_purchased (INTEGER) - Lifetime purchases
- total_tokens_used (INTEGER) - Lifetime usage
- stripe_customer_id (TEXT) - Stripe customer ID
- created_at (TEXT) - ISO timestamp
```

### `transactions` Table
```sql
- transaction_id (TEXT PRIMARY KEY) - UUID
- user_id (TEXT) - Foreign key to users
- type (TEXT) - 'purchase' or 'usage'
- token_amount (INTEGER) - Positive for purchase, negative for usage
- balance_after (INTEGER) - Balance after transaction
- description (TEXT) - Human-readable description
- created_at (TEXT) - ISO timestamp
```

### `mcp_actions` Table
```sql
- action_id (TEXT PRIMARY KEY) - UUID
- user_id (TEXT) - Foreign key to users
- mcp_server_name (TEXT) - e.g., 'nbp-exchange-mcp'
- tool_name (TEXT) - e.g., 'getCurrencyRate'
- parameters (TEXT) - JSON string of tool parameters
- tokens_consumed (INTEGER) - Tokens used for this action
- success (INTEGER) - 1 for success, 0 for failure
- created_at (TEXT) - ISO timestamp
```

## Implementation Checklist

Use this checklist when integrating a new MCP server:

### Step 1: Configuration (5 minutes)

- [ ] Add D1 database binding to `wrangler.jsonc`:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "mcp-tokens-database",
    "database_id": "ebb389aa-2d65-4d38-a0da-50c7da9dfe8b"
  }
]
```

### Step 2: Type Definitions (5 minutes)

- [ ] Update `src/types.ts` - Add DB to Env:
```typescript
export interface Env {
    OAUTH_KV: KVNamespace;
    MCP_OBJECT: DurableObjectNamespace;
    DB: D1Database;  // ADD THIS
    WORKOS_CLIENT_ID: string;
    WORKOS_API_KEY: string;
}
```

- [ ] Update `src/props.ts` - Add database fields:
```typescript
export interface Props {
    // WorkOS authentication data
    user: User;
    accessToken: string;
    refreshToken: string;
    permissions: string[];
    organizationId?: string;

    // Database user data (ADD THESE)
    userId: string;
    email: string;
    currentBalance: number;

    [key: string]: unknown;
}
```

### Step 3: Token Utilities (10 minutes)

- [ ] Copy `src/tokenUtils.ts` from NBP MCP server (or create from template below)
- [ ] Update server name in comments if needed
- [ ] Verify all imports are correct

**Template: `src/tokenUtils.ts`** (see NBP implementation)

### Step 4: OAuth Handler (10 minutes)

- [ ] Import token utilities in `src/authkit-handler.ts`:
```typescript
import { getUserByEmail, formatPurchaseRequiredPage } from "./tokenUtils";
```

- [ ] Add database check in OAuth callback (after `authenticateWithCode`):
```typescript
// Check if user exists in database
const dbUser = await getUserByEmail(c.env.DB, user.email);

if (!dbUser) {
    console.log(`[MCP OAuth] ❌ User not found: ${user.email}`);
    return c.html(formatPurchaseRequiredPage(user.email), 403);
}

console.log(`[MCP OAuth] ✅ User found: ${dbUser.user_id}, balance: ${dbUser.current_token_balance}`);
```

- [ ] Add database fields to props in `completeAuthorization`:
```typescript
props: {
    // WorkOS authentication data
    accessToken,
    organizationId,
    permissions,
    refreshToken,
    user,

    // Database user data
    userId: dbUser.user_id,
    email: dbUser.email,
    currentBalance: dbUser.current_token_balance,
} satisfies Props
```

### Step 5: Tool Token Checking (15 minutes per tool)

- [ ] Import token utilities in `src/server.ts`:
```typescript
import { checkTokenBalance, deductTokens, formatInsufficientTokensError } from "./tokenUtils";
```

- [ ] For each tool, apply the 6-step pattern:

```typescript
this.server.tool(
    "toolName",
    "Tool description. ⚠️ This tool costs X token(s) per use.",
    { /* zod schema */ },
    async (params) => {
        const TOOL_COST = X; // Define cost
        const TOOL_NAME = "toolName";

        try {
            // 1. Get user ID from props
            const userId = this.props?.userId;
            if (!userId) {
                throw new Error("User ID not found in authentication context");
            }

            // 2. Check token balance (ALWAYS query database)
            const balanceCheck = await checkTokenBalance(this.env.DB, userId, TOOL_COST);

            // 3. If insufficient, return Polish error
            if (!balanceCheck.sufficient) {
                return {
                    content: [{
                        type: "text" as const,
                        text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST)
                    }],
                    isError: true
                };
            }

            // 4. Execute tool logic
            const result = await yourToolLogic(params);

            // 5. Deduct tokens atomically
            await deductTokens(
                this.env.DB,
                userId,
                TOOL_COST,
                "your-mcp-server-name", // e.g., "nbp-exchange-mcp"
                TOOL_NAME,
                params
            );

            // 6. Return result
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
```

### Step 6: Deployment & Testing (10 minutes)

- [ ] Type check: `npx tsc --noEmit`
- [ ] Deploy: `wrangler deploy`
- [ ] Test with user in database (krokodylek1981@gmail.com)
- [ ] Test with user NOT in database (should see purchase page)
- [ ] Verify transactions in database
- [ ] Check dashboard at panel.wtyczki.ai/dashboard

## Cost Configuration

Define token costs based on tool complexity:

| Tool Complexity | Suggested Cost | Examples |
|----------------|----------------|----------|
| Simple lookup | 1 token | getCurrencyRate, getGoldPrice |
| Historical data | 1-2 tokens | getCurrencyHistory (93 days max) |
| AI inference | 3-5 tokens | Text generation, summarization |
| Image generation | 5-10 tokens | DALL-E, Stable Diffusion |
| Video processing | 10-20 tokens | Video analysis, transcription |

**Cost Variables:**
```typescript
const TOOL_COST = 1; // Adjust per tool
```

## Error Messages (Polish)

All error messages use Polish language:

```typescript
// Insufficient tokens
"Niewystarczająca liczba tokenów do wykonania {toolName}.
Aktualny stan: {balance} {tokenWord}
Wymagane: {required} {requiredWord}
Kup tokeny: https://panel.wtyczki.ai/"

// Token word grammar:
// 1 token → "token"
// 2-4 tokens → "tokeny"
// 5+ tokens → "tokenów"
// 0 tokens → "tokenów"
```

## Critical Implementation Rules

### ⚠️ ALWAYS Rules

1. **ALWAYS query database for current balance** - Never cache balance values
2. **ALWAYS check balance BEFORE execution** - Don't charge for failed operations
3. **ALWAYS use atomic transactions** - `db.batch()` ensures all-or-nothing
4. **ALWAYS log actions** - Record in `mcp_actions` table for analytics
5. **ALWAYS use Polish error messages** - User-facing errors in Polish

### ❌ NEVER Rules

1. **NEVER cache user balance** - Always query fresh from database
2. **NEVER deduct tokens before execution** - Check → Execute → Deduct
3. **NEVER skip transaction logging** - Every deduction must be logged
4. **NEVER hardcode database IDs** - Use environment bindings
5. **NEVER charge for input validation errors** - Validate before token check

## File Templates

### Complete `src/tokenUtils.ts` Template

**Copy this file from NBP MCP server:**
```bash
cp /Users/patpil/Documents/ai-projects/Cloudflare_mcp/projects/nbp-exchange-mcp/src/tokenUtils.ts \
   /path/to/your-new-mcp-server/src/tokenUtils.ts
```

### Tool Pattern Template

```typescript
// Template for any MCP tool with token checking
this.server.tool(
    "TOOL_NAME",
    "TOOL_DESCRIPTION ⚠️ This tool costs X token(s) per use.",
    {
        // Zod schema
        param1: z.string().describe("Description"),
        param2: z.number().optional().describe("Description"),
    },
    async ({ param1, param2 }) => {
        const TOOL_COST = X;
        const TOOL_NAME = "TOOL_NAME";

        try {
            // 1. Get user ID
            const userId = this.props?.userId;
            if (!userId) {
                throw new Error("User ID not found in authentication context");
            }

            // 2. Check balance
            const balanceCheck = await checkTokenBalance(this.env.DB, userId, TOOL_COST);

            // 3. Handle insufficient balance
            if (!balanceCheck.sufficient) {
                return {
                    content: [{
                        type: "text" as const,
                        text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST)
                    }],
                    isError: true
                };
            }

            // 4. Execute tool
            const result = await executeToolLogic(param1, param2);

            // 5. Deduct tokens
            await deductTokens(
                this.env.DB,
                userId,
                TOOL_COST,
                "SERVER_NAME",
                TOOL_NAME,
                { param1, param2 }
            );

            // 6. Return result
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
```

## Testing Strategy

### Test Case 1: User with Tokens
```bash
# User: krokodylek1981@gmail.com (has tokens)
1. Connect to MCP server
2. Authenticate via WorkOS
3. Execute tool
4. Verify: Tool succeeds, tokens deducted, transaction logged
5. Check dashboard: Balance decreased by X tokens
```

### Test Case 2: User without Account
```bash
# User: newemail@example.com (not in database)
1. Connect to MCP server
2. Authenticate via WorkOS
3. Expected: 403 error page with "Kup tokeny" link
4. Verify: No access to tools
```

### Test Case 3: Insufficient Balance
```bash
# User with 0 tokens
1. Connect to MCP server
2. Try to execute tool
3. Expected: Polish error message with current balance (0) and required tokens
4. Verify: No token deduction, no API call made
```

### Test Case 4: Concurrent Requests
```bash
# Test race conditions
1. Execute same tool twice rapidly
2. Verify: Both deductions logged separately
3. Verify: No duplicate deductions
4. Check: Final balance = initial - (2 × TOOL_COST)
```

## Monitoring & Analytics

### Database Queries for Analytics

**User token usage by server:**
```sql
SELECT
    mcp_server_name,
    COUNT(*) as total_calls,
    SUM(tokens_consumed) as total_tokens
FROM mcp_actions
WHERE user_id = ?
GROUP BY mcp_server_name
ORDER BY total_tokens DESC;
```

**Most popular tools:**
```sql
SELECT
    mcp_server_name,
    tool_name,
    COUNT(*) as calls,
    SUM(tokens_consumed) as tokens
FROM mcp_actions
WHERE success = 1
GROUP BY mcp_server_name, tool_name
ORDER BY calls DESC
LIMIT 10;
```

**User balance history:**
```sql
SELECT
    created_at,
    type,
    token_amount,
    balance_after,
    description
FROM transactions
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 50;
```

### Cloudflare Logs

Monitor in real-time:
```bash
wrangler tail --format pretty
```

Key log messages:
- `[MCP OAuth] ✅ User found: {userId}, balance: {balance}` - Success
- `[MCP OAuth] ❌ User not found: {email}` - Need to purchase
- `[Token Utils] Balance check: user {userId} has {balance} tokens, needs {required}` - Token check
- `[Token Utils] ✅ Success! User {userId}: {oldBalance} → {newBalance} tokens` - Deduction

## Future Enhancements

### Planned Features (mcp-token-system roadmap)

1. **Token Packages** - Bulk purchase discounts
2. **Subscription Plans** - Monthly token allowances
3. **Usage Analytics** - Detailed breakdowns per server/tool
4. **Alerts** - Low balance notifications
5. **Refunds** - Failed action token returns
6. **Rate Limiting** - Per-user request limits

### Integration Considerations

When implementing new MCP servers:

1. **Tool Costs** - Price based on computational cost, API fees, complexity
2. **Validation First** - Always validate input before checking tokens
3. **Error Handling** - Don't charge for server errors or API failures
4. **Idempotency** - Use UUIDs to prevent duplicate charges
5. **Logging** - Log everything for debugging and analytics

## Quick Start Script

Use this script to rapidly integrate a new MCP server:

```bash
#!/bin/bash
# integrate-token-system.sh

SERVER_NAME=$1
SERVER_PATH=$2

if [ -z "$SERVER_NAME" ] || [ -z "$SERVER_PATH" ]; then
    echo "Usage: ./integrate-token-system.sh <server-name> <server-path>"
    exit 1
fi

echo "Integrating token system for $SERVER_NAME..."

# 1. Copy token utilities
cp /Users/patpil/Documents/ai-projects/Cloudflare_mcp/projects/nbp-exchange-mcp/src/tokenUtils.ts \
   "$SERVER_PATH/src/tokenUtils.ts"

# 2. Update wrangler.jsonc (manual step - show instructions)
echo "
Next steps:

1. Add to wrangler.jsonc:
   \"d1_databases\": [{
     \"binding\": \"DB\",
     \"database_name\": \"mcp-tokens-database\",
     \"database_id\": \"ebb389aa-2d65-4d38-a0da-50c7da9dfe8b\"
   }]

2. Add DB: D1Database to src/types.ts Env interface

3. Add userId, email, currentBalance to src/props.ts Props interface

4. Update src/authkit-handler.ts with database check

5. Apply 6-step pattern to all tools in src/server.ts

6. Deploy: wrangler deploy

See TOKEN_INTEGRATION.md for complete guide.
"
```

## Support & Troubleshooting

### Common Issues

**Issue: "User ID not found in authentication context"**
- Cause: Props not set correctly in OAuth callback
- Fix: Verify `completeAuthorization` includes `userId: dbUser.user_id`

**Issue: Database query fails**
- Cause: D1 binding not configured
- Fix: Check `wrangler.jsonc` has correct database binding

**Issue: Balance not updating**
- Cause: Atomic transaction failed
- Fix: Check `db.batch()` includes all three operations

**Issue: Polish characters not displaying**
- Cause: Encoding issue
- Fix: Ensure UTF-8 encoding in all files

### Contact

- **GitHub**: [Cloudflare MCP Project Repository]
- **Database Admin**: panel.wtyczki.ai/dashboard
- **Token Purchase**: panel.wtyczki.ai

## Summary

This integration pattern enables rapid deployment of pay-per-use MCP servers:

✅ **15-30 minutes per server** - Quick integration time
✅ **Consistent pattern** - Copy-paste from NBP implementation
✅ **Shared database** - Single source of truth for all servers
✅ **Atomic transactions** - No race conditions or data loss
✅ **Polish UX** - Localized error messages
✅ **Analytics ready** - Complete logging for insights

**Next Server Integration:** Simply follow the 6-step checklist and use the provided templates!
