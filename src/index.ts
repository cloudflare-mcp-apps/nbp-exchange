import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { NbpMCP } from "./server";
import { AuthkitHandler } from "./authkit-handler";

// Export the McpAgent class for Cloudflare Workers
export { NbpMCP };

/**
 * NBP Exchange MCP Server with WorkOS Authentication
 *
 * This MCP server is protected by OAuth 2.1 authentication using WorkOS AuthKit.
 * Users must authenticate via Magic Auth (6-digit email code) before accessing NBP tools.
 *
 * OAuth Endpoints (automatically handled by OAuthProvider):
 * - /authorize - Initiates OAuth flow, redirects to WorkOS AuthKit
 * - /callback - Handles OAuth callback from WorkOS
 * - /token - Token endpoint for OAuth clients
 * - /register - Dynamic Client Registration endpoint
 *
 * MCP Endpoints (protected by authentication):
 * - /sse - Server-Sent Events transport (widely supported)
 * - /mcp - Streamable HTTP transport (newer standard)
 *
 * Authentication Flow:
 * 1. MCP client connects and initiates OAuth
 * 2. User redirected to WorkOS AuthKit
 * 3. User enters email → receives 6-digit Magic Auth code
 * 4. User enters code → WorkOS validates
 * 5. OAuth completes, tokens issued
 * 6. MCP client can now access protected tools
 *
 * Available Tools (after authentication):
 * - getCurrencyRate: Get current/historical buy/sell rates for currencies
 * - getGoldPrice: Get NBP official gold price
 * - getCurrencyHistory: Get historical rate series over date range
 */
export default new OAuthProvider({
    // MCP endpoints with dual transport support
    apiHandlers: {
        '/sse': NbpMCP.serveSSE('/sse'),   // Server-Sent Events transport
        '/mcp': NbpMCP.serve('/mcp'),       // Streamable HTTP transport
    },

    // OAuth authentication handler (WorkOS AuthKit integration)
    defaultHandler: AuthkitHandler as any,

    // OAuth 2.1 endpoints
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
});
