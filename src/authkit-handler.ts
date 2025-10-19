import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import * as jose from "jose";
import { type AccessToken, type AuthenticationResponse, WorkOS } from "@workos-inc/node";
import type { Env } from "./types";
import type { Props } from "./props";
import { getUserByEmail, formatPurchaseRequiredPage, formatAccountDeletedPage } from "./tokenUtils";

/**
 * Authentication handler for WorkOS AuthKit integration
 *
 * This Hono app implements OAuth 2.1 routes for MCP client authentication:
 * - /authorize: Redirects users to WorkOS AuthKit (Magic Auth)
 * - /callback: Handles OAuth callback and completes authorization
 *
 * Magic Auth flow:
 * 1. User clicks "Connect" in MCP client
 * 2. Redirected to /authorize → WorkOS AuthKit
 * 3. User enters email → receives 6-digit code
 * 4. User enters code → WorkOS validates
 * 5. Callback to /callback with authorization code
 * 6. Exchange code for tokens and user info
 * 7. Complete OAuth and redirect back to MCP client
 */
const app = new Hono<{
    Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers };
    Variables: { workOS: WorkOS };
}>();

/**
 * Middleware: Initialize WorkOS SDK for all routes
 */
app.use(async (c, next) => {
    c.set("workOS", new WorkOS(c.env.WORKOS_API_KEY));
    await next();
});

/**
 * GET /authorize
 *
 * Initiates OAuth flow by redirecting user to WorkOS AuthKit.
 * MCP client state is encoded and passed through the OAuth flow.
 */
app.get("/authorize", async (c) => {
    // Parse the OAuth request from the MCP client
    const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
    if (!oauthReqInfo.clientId) {
        return c.text("Invalid request", 400);
    }

    // Redirect to WorkOS AuthKit with Magic Auth enabled
    return Response.redirect(
        c.get("workOS").userManagement.getAuthorizationUrl({
            provider: "authkit", // Enables Magic Auth (6-digit email code)
            clientId: c.env.WORKOS_CLIENT_ID, // WorkOS application client ID
            redirectUri: new URL("/callback", c.req.url).href,
            // Pass the MCP client ID in state so we can use it in callback
            state: btoa(JSON.stringify(oauthReqInfo)), // Store OAuth request state including MCP client ID
        }),
    );
});

/**
 * GET /callback
 *
 * Handles OAuth callback from WorkOS AuthKit after successful authentication.
 * Exchanges authorization code for tokens and completes the OAuth flow.
 */
app.get("/callback", async (c) => {
    const workOS = c.get("workOS");

    // Decode the OAuth request info from state parameter
    const oauthReqInfo = JSON.parse(atob(c.req.query("state") as string)) as AuthRequest;
    if (!oauthReqInfo.clientId) {
        return c.text("Invalid state", 400);
    }

    // Get authorization code from query params
    const code = c.req.query("code");
    if (!code) {
        return c.text("Missing code", 400);
    }

    // Exchange authorization code for tokens and user info
    let response: AuthenticationResponse;
    try {
        response = await workOS.userManagement.authenticateWithCode({
            clientId: c.env.WORKOS_CLIENT_ID,
            code,
        });
    } catch (error) {
        console.error("Authentication error:", error);
        return c.text("Invalid authorization code", 400);
    }

    // Extract authentication data
    const { accessToken, organizationId, refreshToken, user } = response;

    // Decode JWT to get permissions
    const { permissions = [] } = jose.decodeJwt<AccessToken>(accessToken);

    // CRITICAL: Check if user exists in token database
    console.log(`[NBP OAuth] Checking if user exists in database: ${user.email}`);
    const dbUser = await getUserByEmail(c.env.DB, user.email);

    // If user not found in database, reject authorization and show purchase page
    if (!dbUser) {
        console.log(`[NBP OAuth] ❌ User not found in database: ${user.email} - Tokens required`);
        return c.html(formatPurchaseRequiredPage(user.email), 403);
    }

    // SECURITY FIX: Defensive check for deleted accounts (belt-and-suspenders approach)
    // This provides defense-in-depth even if getUserByEmail() query is modified
    if (dbUser.is_deleted === 1) {
        console.log(`[NBP OAuth] ❌ Account deleted: ${user.email} (user_id: ${dbUser.user_id})`);
        return c.html(formatAccountDeletedPage(), 403);
    }

    console.log(`[NBP OAuth] ✅ User found in database: ${dbUser.user_id}, balance: ${dbUser.current_token_balance} tokens`);

    // Complete OAuth flow and get redirect URL back to MCP client
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthReqInfo,
        userId: user.id,
        metadata: {},
        scope: permissions,

        // Props will be available via `this.props` in NbpMCP class
        // Include database user info for token management
        props: {
            // WorkOS authentication data
            accessToken,
            organizationId,
            permissions,
            refreshToken,
            user,

            // Database user data for token management
            userId: dbUser.user_id,
            email: dbUser.email,
        } satisfies Props,
    });

    // Redirect user back to MCP client with authorization complete
    return Response.redirect(redirectTo);
});

export const AuthkitHandler = app;
