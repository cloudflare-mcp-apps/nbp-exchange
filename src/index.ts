import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { NbpMCP } from "./server";
import { AuthkitHandler } from "./authkit-handler";
import {
    handleCustomLoginPage,
    handleSendMagicAuthCode,
    handleVerifyMagicAuthCode,
} from "./routes/customAuth";
import type { Env } from "./types";

// Export the McpAgent class for Cloudflare Workers
export { NbpMCP };

/**
 * NBP Exchange MCP Server with WorkOS Authentication
 *
 * This MCP server is protected by OAuth 2.1 authentication using WorkOS AuthKit.
 * Users must authenticate via custom branded Magic Auth (6-digit email code).
 *
 * Custom Login Routes:
 * - /auth/login-custom - Custom branded email input form
 * - /auth/login-custom/send-code - Send Magic Auth code
 * - /auth/login-custom/verify-code - Verify code and create session
 *
 * OAuth Endpoints (automatically handled by OAuthProvider):
 * - /authorize - Initiates OAuth flow, checks session, redirects to custom login
 * - /callback - Handles OAuth callback from WorkOS
 * - /token - Token endpoint for OAuth clients
 * - /register - Dynamic Client Registration endpoint
 *
 * MCP Endpoints (protected by authentication):
 * - /sse - Server-Sent Events transport (legacy, for Claude Desktop)
 * - /mcp - Streamable HTTP transport (new standard, for ChatGPT and modern clients)
 *
 * Authentication Flow:
 * 1. MCP client connects and initiates OAuth
 * 2. User redirected to /auth/login-custom (custom branded form)
 * 3. User enters email → sends to /auth/login-custom/send-code
 * 4. System checks database → sends 6-digit Magic Auth code via WorkOS
 * 5. User enters code → posts to /auth/login-custom/verify-code
 * 6. System verifies code → creates session → redirects back to OAuth
 * 7. OAuth completes, tokens issued
 * 8. MCP client can now access protected tools
 *
 * Available Tools (after authentication):
 * - getCurrencyRate: Get current/historical buy/sell rates for currencies
 * - getGoldPrice: Get NBP official gold price
 * - getCurrencyHistory: Get historical rate series over date range
 */

const app = new Hono<{ Bindings: Env }>();

// Custom login routes (must be before OAuth provider)
app.get('/auth/login-custom', async (c) => {
    return await handleCustomLoginPage(c.req.raw);
});

app.post('/auth/login-custom/send-code', async (c) => {
    return await handleSendMagicAuthCode(c.req.raw, c.env);
});

app.post('/auth/login-custom/verify-code', async (c) => {
    return await handleVerifyMagicAuthCode(c.req.raw, c.env);
});

// Mount OAuth provider for all other routes
const oauthProvider = new OAuthProvider({
    apiHandlers: {
        '/sse': NbpMCP.serveSSE('/sse'),
        '/mcp': NbpMCP.serve('/mcp'),
    },
    defaultHandler: AuthkitHandler as any,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
});

app.all('*', (c) => {
    return oauthProvider.fetch(c.req.raw, c.env, c.executionCtx);
});

export default app;
