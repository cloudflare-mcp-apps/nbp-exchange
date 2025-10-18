# MCP Server Token Integration - Quick Checklist

**Time: 15-30 minutes per server** | **Database ID**: `ebb389aa-2d65-4d38-a0da-50c7da9dfe8b`

## Pre-Integration

- [ ] Copy `src/tokenUtils.ts` from NBP MCP server
- [ ] Have WorkOS credentials ready (same for all servers)
- [ ] Know your tool costs (1, 2, 3, 5, 10 tokens per tool)

## 1. Configuration (5 min)

### `wrangler.jsonc`
```jsonc
"d1_databases": [{
  "binding": "DB",
  "database_name": "mcp-tokens-database",
  "database_id": "ebb389aa-2d65-4d38-a0da-50c7da9dfe8b"
}]
```

## 2. Types (5 min)

### `src/types.ts`
```typescript
export interface Env {
    DB: D1Database;  // ADD THIS LINE
    // ... rest of Env
}
```

### `src/props.ts`
```typescript
export interface Props {
    // ... WorkOS fields
    userId: string;              // ADD
    email: string;               // ADD
    currentBalance: number;      // ADD
    [key: string]: unknown;
}
```

## 3. OAuth Handler (10 min)

### `src/authkit-handler.ts`

**Add imports:**
```typescript
import { getUserByEmail, formatPurchaseRequiredPage } from "./tokenUtils";
```

**After `authenticateWithCode()`, add:**
```typescript
const dbUser = await getUserByEmail(c.env.DB, user.email);

if (!dbUser) {
    console.log(`[MCP OAuth] ❌ User not found: ${user.email}`);
    return c.html(formatPurchaseRequiredPage(user.email), 403);
}
```

**In `completeAuthorization`, add to props:**
```typescript
props: {
    // ... WorkOS fields
    userId: dbUser.user_id,
    email: dbUser.email,
    currentBalance: dbUser.current_token_balance,
}
```

## 4. Tools (15 min per tool)

### `src/server.ts`

**Add imports:**
```typescript
import { checkTokenBalance, deductTokens, formatInsufficientTokensError } from "./tokenUtils";
```

**For EACH tool, wrap handler:**
```typescript
this.server.tool(
    "toolName",
    "Description. ⚠️ This tool costs X token(s) per use.",
    { /* schema */ },
    async (params) => {
        const TOOL_COST = X;
        const TOOL_NAME = "toolName";

        try {
            // 1. Get user ID
            const userId = this.props?.userId;
            if (!userId) throw new Error("User ID not found");

            // 2. Check balance
            const balanceCheck = await checkTokenBalance(
                this.env.DB, userId, TOOL_COST
            );

            // 3. Insufficient tokens?
            if (!balanceCheck.sufficient) {
                return {
                    content: [{
                        type: "text" as const,
                        text: formatInsufficientTokensError(
                            TOOL_NAME,
                            balanceCheck.currentBalance,
                            TOOL_COST
                        )
                    }],
                    isError: true
                };
            }

            // 4. Execute tool
            const result = await yourToolLogic(params);

            // 5. Deduct tokens
            await deductTokens(
                this.env.DB,
                userId,
                TOOL_COST,
                "your-server-name",  // e.g., "nbp-exchange-mcp"
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

## 5. Deploy & Test (10 min)

```bash
# Type check
npx tsc --noEmit

# Deploy
wrangler deploy

# Monitor logs
wrangler tail --format pretty
```

### Test Cases
- [ ] User with tokens (krokodylek1981@gmail.com) → Tool works, tokens deducted
- [ ] User without account (new email) → 403 purchase page
- [ ] User with 0 tokens → Polish error message
- [ ] Verify transactions in database
- [ ] Check dashboard at panel.wtyczki.ai/dashboard

## Copy-Paste Snippets

### Token Cost Reference
```typescript
const TOOL_COST = 1;   // Simple lookup
const TOOL_COST = 2;   // Historical data
const TOOL_COST = 3;   // AI inference
const TOOL_COST = 5;   // Image generation
const TOOL_COST = 10;  // Video processing
```

### Polish Error Message (auto-generated)
```
Niewystarczająca liczba tokenów do wykonania {tool}.
Aktualny stan: X tokenów
Wymagane: Y token(ów)
Kup tokeny: https://panel.wtyczki.ai/
```

## Critical Rules

✅ **ALWAYS**:
- Query database for balance (never cache)
- Check balance BEFORE execution
- Use atomic transactions (db.batch)
- Log all actions
- Use Polish error messages

❌ **NEVER**:
- Cache user balance
- Deduct tokens before execution
- Skip transaction logging
- Hardcode database IDs
- Charge for validation errors

## Database Schema Quick Ref

```sql
users: user_id, email, current_token_balance, total_tokens_used
transactions: transaction_id, user_id, type, token_amount, balance_after
mcp_actions: action_id, user_id, mcp_server_name, tool_name, tokens_consumed
```

## Files to Copy from NBP MCP

```bash
# Copy token utilities
cp nbp-exchange-mcp/src/tokenUtils.ts your-server/src/tokenUtils.ts

# Reference OAuth pattern
cat nbp-exchange-mcp/src/authkit-handler.ts

# Reference tool pattern
cat nbp-exchange-mcp/src/server.ts
```

## Next Server?

Just follow these 5 steps:
1. ✅ Config (wrangler.jsonc)
2. ✅ Types (types.ts, props.ts)
3. ✅ OAuth (authkit-handler.ts)
4. ✅ Tools (server.ts)
5. ✅ Deploy & Test

**Total time: 15-30 minutes**

---

📖 **Full Guide**: See `TOKEN_INTEGRATION.md` for detailed documentation
🗄️ **Database**: `ebb389aa-2d65-4d38-a0da-50c7da9dfe8b`
🎫 **Purchase**: https://panel.wtyczki.ai
📊 **Dashboard**: https://panel.wtyczki.ai/dashboard
