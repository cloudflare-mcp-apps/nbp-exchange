# WorkOS Magic Auth Setup Guide for MCP Servers

This guide documents the lessons learned from implementing WorkOS Magic Auth for the NBP Exchange MCP server. Follow these instructions when setting up authentication for future MCP servers.

## Critical Configuration Requirements

### 1. Environment Matching (MOST IMPORTANT!)

**The WORKOS_API_KEY and WORKOS_CLIENT_ID MUST be from the SAME environment.**

```
❌ WRONG - Will cause "Invalid client secret" errors:
WORKOS_API_KEY=sk_...        (from Staging environment)
WORKOS_CLIENT_ID=client_...  (from Production environment)

✅ CORRECT - Both from Production:
WORKOS_API_KEY=sk_...        (from Production environment)
WORKOS_CLIENT_ID=client_...  (from Production environment)
```

### 2. Correct WorkOS SDK Initialization

**Use WORKOS_API_KEY (not WORKOS_CLIENT_SECRET) to initialize the SDK:**

```typescript
// ❌ WRONG - Will fail with "Invalid client secret"
app.use(async (c, next) => {
    c.set("workOS", new WorkOS(c.env.WORKOS_CLIENT_SECRET));
    await next();
});

// ✅ CORRECT - Initialize with API Key
app.use(async (c, next) => {
    c.set("workOS", new WorkOS(c.env.WORKOS_API_KEY));
    await next();
});
```

### 3. WorkOS Credentials Explained

WorkOS has THREE different types of credentials:

| Credential | Format | Purpose | Where Used |
|------------|--------|---------|------------|
| **WORKOS_API_KEY** | `sk_*` | Server-side API calls | Initialize `new WorkOS()` |
| **WORKOS_CLIENT_ID** | `client_*` | OAuth authorization flow | `getAuthorizationUrl()`, `authenticateWithCode()` |
| **OAuth Client Secret** | Random string | Direct OAuth API calls (not SDK) | Only when calling WorkOS REST API directly |

**For Node.js SDK:** You only need `WORKOS_API_KEY` + `WORKOS_CLIENT_ID`

## Step-by-Step Setup for New MCP Servers

### Step 1: Choose Your WorkOS Environment

Decide which WorkOS environment to use:
- **Staging**: For development/testing
- **Production**: For deployed servers (recommended for wtyczki.ai)

### Step 2: Get Credentials from WorkOS Dashboard

1. Log in to [WorkOS Dashboard](https://dashboard.workos.com)
2. Select your environment (top-right corner)
3. Go to **API Keys** section:
   - Copy the **API Key** (starts with `sk_`)
4. Go to **Applications** → Select/Create your application:
   - Copy the **Client ID** (starts with `client_`)
   - Note the **Application ID** (starts with `app_`)

**VERIFY:** Check that both credentials are from the same environment!

### Step 3: Configure WorkOS Application

In the WorkOS Dashboard application settings:

1. **Redirect URI**: Add your callback URL
   ```
   https://your-server.wtyczki.ai/callback
   ```

2. **Authentication Methods**: Enable
   - ✅ Magic Auth (6-digit email code)
   - ✅ Any other methods you need

3. **Initiate Login URL** (optional):
   ```
   https://your-server.wtyczki.ai/
   ```

### Step 4: Configure Cloudflare Secrets

Set the secrets using Wrangler CLI:

```bash
# Set API Key (from WorkOS Dashboard → API Keys)
echo "sk_YOUR_API_KEY_HERE" | wrangler secret put WORKOS_API_KEY

# Set Client ID (from WorkOS Dashboard → Applications → Your App)
echo "client_YOUR_CLIENT_ID_HERE" | wrangler secret put WORKOS_CLIENT_ID

# Deploy to apply secrets
wrangler deploy
```

**VERIFY:** Both secrets are from the same WorkOS environment!

### Step 5: Code Implementation

#### Environment Types (`src/types.ts`)

```typescript
export interface Env {
    OAUTH_KV: KVNamespace;
    MCP_OBJECT: DurableObjectNamespace;

    // WorkOS credentials (MUST be from same environment!)
    WORKOS_CLIENT_ID: string;
    WORKOS_API_KEY: string;  // NOT WORKOS_CLIENT_SECRET!
}
```

#### Auth Handler Middleware (`src/authkit-handler.ts`)

```typescript
import { WorkOS } from "@workos-inc/node";

app.use(async (c, next) => {
    // ✅ Initialize with API Key
    c.set("workOS", new WorkOS(c.env.WORKOS_API_KEY));
    await next();
});
```

#### Authorization Endpoint

```typescript
app.get("/authorize", async (c) => {
    const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

    return Response.redirect(
        c.get("workOS").userManagement.getAuthorizationUrl({
            provider: "authkit",              // Enables Magic Auth
            clientId: c.env.WORKOS_CLIENT_ID, // Use Client ID here
            redirectUri: new URL("/callback", c.req.url).href,
            state: btoa(JSON.stringify(oauthReqInfo)),
        }),
    );
});
```

#### Callback Endpoint

```typescript
app.get("/callback", async (c) => {
    const workOS = c.get("workOS");
    const code = c.req.query("code");
    const oauthReqInfo = JSON.parse(atob(c.req.query("state") as string));

    // Exchange authorization code for user info
    const response = await workOS.userManagement.authenticateWithCode({
        clientId: c.env.WORKOS_CLIENT_ID, // Use Client ID here
        code,
    });

    // Complete OAuth and redirect
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthReqInfo,
        userId: response.user.id,
        scope: permissions,
        props: {
            user: response.user,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            // ... other data
        },
    });

    return Response.redirect(redirectTo);
});
```

## Common Errors and Solutions

### Error: "Invalid client secret"

**Cause:** WORKOS_API_KEY and WORKOS_CLIENT_ID are from different environments

**Solution:**
1. Check which environment your Client ID is from in WorkOS Dashboard
2. Get the matching API Key from the SAME environment
3. Update secrets and redeploy

### Error: "Invalid authorization code"

**Cause:** Usually a timing issue or code already used

**Solution:**
- Magic Auth codes expire in 10 minutes
- Authorization codes can only be used once
- Try the flow again with a fresh code

### Error: "Invalid redirect URI"

**Cause:** Callback URL not configured in WorkOS Dashboard

**Solution:**
1. Go to WorkOS Dashboard → Applications → Your App
2. Add the exact callback URL: `https://your-server.wtyczki.ai/callback`
3. No wildcards allowed in production

## Verification Checklist

Before deploying a new MCP server with WorkOS auth:

- [ ] WORKOS_API_KEY is from the correct environment (staging/production)
- [ ] WORKOS_CLIENT_ID is from the SAME environment
- [ ] Both secrets are set in Cloudflare via `wrangler secret put`
- [ ] Redirect URI is configured in WorkOS Dashboard application
- [ ] Magic Auth is enabled in WorkOS Dashboard application
- [ ] Code initializes WorkOS SDK with `WORKOS_API_KEY` (not CLIENT_SECRET)
- [ ] Code uses `WORKOS_CLIENT_ID` in authorization flow
- [ ] wrangler.jsonc has KV namespace configured for OAuth tokens
- [ ] wrangler.jsonc has Durable Objects configured for McpAgent
- [ ] Deployed with `wrangler deploy`

## Testing Authentication

1. **Connect to your MCP server:**
   ```
   https://your-server.wtyczki.ai/sse
   ```

2. **Expected flow:**
   - Client initiates connection → Gets 401 Unauthorized ✅
   - OAuth discovery happens ✅
   - Redirect to WorkOS AuthKit ✅
   - Enter email → Receive 6-digit code ✅
   - Enter code → Authentication succeeds ✅
   - Client reconnects with valid token ✅
   - MCP tools become available ✅

3. **Check logs:**
   ```bash
   wrangler tail --format pretty
   ```

4. **Success indicators in logs:**
   ```
   GET /callback?code=... - Ok
   NbpMCP.updateProps - Ok
   NbpMCP.onSSEMcpMessage - Ok
   POST /token - Ok
   ```

5. **Failure indicators (fix before production):**
   ```
   (error) Authentication error: OauthException: Error: invalid_client
   (error) Invalid client secret
   ```

## Scaling to Multiple MCP Servers

You can use a **single WorkOS Application** for multiple MCP servers:

1. In WorkOS Dashboard → Applications → Your App
2. Add multiple Redirect URIs:
   ```
   https://server1.wtyczki.ai/callback
   https://server2.wtyczki.ai/callback
   https://server3.wtyczki.ai/callback
   ...
   ```

3. Use the **same** WORKOS_API_KEY and WORKOS_CLIENT_ID for all servers

**Benefits:**
- Single user database shared across all servers
- Simplified user management
- One place to configure authentication methods
- Users authenticate once, access all servers

## References

- [WorkOS User Management Guide](https://workos.com/docs/user-management)
- [WorkOS AuthKit Documentation](https://workos.com/docs/user-management/authkit)
- [WorkOS Magic Auth](https://workos.com/docs/user-management/magic-auth)
- [Cloudflare Workers OAuth Provider](https://github.com/cloudflare/workers-oauth-provider)
- [MCP Remote Transport](https://github.com/modelcontextprotocol/mcp-remote)

## Success Story: NBP Exchange MCP

This configuration was successfully tested on:
- **Server**: https://nbp.wtyczki.ai
- **Environment**: Production
- **Date**: October 16, 2025
- **Auth Method**: WorkOS Magic Auth (6-digit email code)
- **Result**: ✅ Fully functional authentication with access to 3 NBP tools

Logs confirmed successful authentication flow with no errors.
