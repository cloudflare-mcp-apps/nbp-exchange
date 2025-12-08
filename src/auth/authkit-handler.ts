import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import * as jose from "jose";
import { type AccessToken, type AuthenticationResponse, WorkOS } from "@workos-inc/node";
import type { Env } from "../types";
import type { Props } from "./props";
import { getUserByEmail, formatPurchaseRequiredPage, formatAccountDeletedPage, formatOAuthSuccessPage } from "../shared/tokenUtils";
import { logger } from "../shared/logger";

/**
 * Authentication handler for WorkOS AuthKit integration
 *
 * This is the DEFAULT authentication implementation using WorkOS-hosted UI.
 * Users see WorkOS branding during login (simple, minimal code, fast setup).
 *
 * ALTERNATIVE: For custom branded login UI, see docs/CUSTOM_LOGIN_GUIDE.md
 * The custom login approach gives you full control over branding and messaging.
 *
 * This Hono app implements OAuth 2.1 routes for MCP client authentication:
 * - /authorize: Redirects users to WorkOS AuthKit (Magic Auth)
 * - /callback: Handles OAuth callback and completes authorization
 *
 * Magic Auth flow (DEFAULT WorkOS UI):
 * 1. User clicks "Connect" in MCP client
 * 2. Redirected to /authorize → WorkOS AuthKit (hosted UI)
 * 3. User enters email → receives 6-digit code
 * 4. User enters code → WorkOS validates
 * 5. Callback to /callback with authorization code
 * 6. Exchange code for tokens and user info
 * 7. Check if user exists in token database
 * 8. IF NOT in database → 403 error page with purchase link
 * 9. IF in database → Complete OAuth and redirect back to MCP client
 *
 * TODO: Customize the server name in formatPurchaseRequiredPage if needed
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
 * Initiates OAuth flow with centralized custom login integration.
 *
 * FLOW:
 * 1. Check for session cookie from centralized login (panel.wtyczki.ai)
 * 2. If no session → redirect to centralized custom login
 * 3. If session exists → validate from USER_SESSIONS KV
 * 4. If session valid → query database and complete OAuth
 * 5. If session invalid/expired → redirect to centralized custom login
 * 6. Fallback to WorkOS if USER_SESSIONS not configured
 *
 * See docs/CUSTOM_LOGIN_GUIDE.md for centralized login architecture.
 */
app.get("/authorize", async (c) => {
    // Parse the OAuth request from the MCP client
    const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
    if (!oauthReqInfo.clientId) {
        return c.text("Invalid request", 400);
    }

    // ============================================================
    // STEP 1: Check for session cookie from centralized login
    // ============================================================
    const cookieHeader = c.req.header('Cookie');
    let sessionToken: string | null = null;

    if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {} as Record<string, string>);
        sessionToken = cookies['workos_session'] || null;
    }

    // ============================================================
    // STEP 2: If no session, redirect to centralized custom login
    // ============================================================
    if (!sessionToken && c.env.USER_SESSIONS) {
        logger.info({ event: "session_check", session_id: "none", valid: false, reason: "No session token found" });
        const loginUrl = new URL('https://panel.wtyczki.ai/auth/login-custom');
        loginUrl.searchParams.set('return_to', c.req.url);
        return Response.redirect(loginUrl.toString(), 302);
    }

    // ============================================================
    // STEP 3: Validate session if present
    // ============================================================
    if (sessionToken && c.env.USER_SESSIONS) {
        const sessionData = await c.env.USER_SESSIONS.get(
            `workos_session:${sessionToken}`,
            'json'
        );

        if (!sessionData) {
            logger.warn({ event: "session_check", session_id: sessionToken, valid: false, reason: "Session not found in KV" });
            const loginUrl = new URL('https://panel.wtyczki.ai/auth/login-custom');
            loginUrl.searchParams.set('return_to', c.req.url);
            return Response.redirect(loginUrl.toString(), 302);
        }

        const session = sessionData as {
            expires_at: number;
            user_id: string;
            email: string
        };

        // Check expiration
        if (session.expires_at < Date.now()) {
            logger.warn({ event: "session_check", session_id: sessionToken, valid: false, reason: "Session expired" });
            const loginUrl = new URL('https://panel.wtyczki.ai/auth/login-custom');
            loginUrl.searchParams.set('return_to', c.req.url);
            return Response.redirect(loginUrl.toString(), 302);
        }

        // ============================================================
        // STEP 4: Session valid - load user from database
        // ============================================================
        logger.info({ event: "session_check", session_id: sessionToken, valid: true });

        // CRITICAL: Query database for current user data (balance, deletion status)
        const dbUser = await getUserByEmail(c.env.TOKEN_DB, session.email);

        if (!dbUser) {
            logger.warn({ event: "user_lookup", lookup_by: "email", user_email: session.email, found: false });
            return c.html(formatPurchaseRequiredPage(session.email), 403);
        }

        if (dbUser.is_deleted === 1) {
            logger.warn({ event: "user_lookup", lookup_by: "email", user_email: session.email, found: false, is_deleted: true });
            return c.html(formatAccountDeletedPage(), 403);
        }

        // ============================================================
        // STEP 5: Complete OAuth authorization directly (skip WorkOS redirect)
        // ============================================================
        const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
            request: oauthReqInfo,
            userId: session.user_id,
            metadata: {},
            scope: [],
            props: {
                // WorkOS data (empty since we used centralized login)
                accessToken: '',
                organizationId: undefined,
                permissions: [],
                refreshToken: '',

                // Reconstructed User object
                user: {
                    id: session.user_id,
                    email: session.email,
                    emailVerified: true,
                    profilePictureUrl: null,
                    firstName: null,
                    lastName: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    lastSignInAt: new Date().toISOString(),
                    locale: null,
                    externalId: null,
                    metadata: {},
                    object: 'user' as const,
                },

                // Database user data (CRITICAL for token operations)
                userId: dbUser.user_id,
                email: dbUser.email,
            } satisfies Props,
        });

        // Show success page with auto-redirect (provides user feedback)
        logger.info({ event: "auth_attempt", method: "oauth", user_email: session.email, user_id: session.user_id, success: true });
        return c.html(formatOAuthSuccessPage(session.email, redirectTo), 200);
    }

    // ============================================================
    // STEP 6: Fallback to WorkOS (if USER_SESSIONS not configured)
    // ============================================================
    logger.info({ event: "auth_attempt", method: "oauth", success: true, reason: "Fallback to WorkOS" });
    return Response.redirect(
        c.get("workOS").userManagement.getAuthorizationUrl({
            provider: "authkit",
            clientId: c.env.WORKOS_CLIENT_ID,
            redirectUri: new URL("/callback", c.req.url).href,
            state: btoa(JSON.stringify(oauthReqInfo)),
        }),
    );
});

/**
 * GET /callback
 *
 * Handles OAuth callback from WorkOS AuthKit after successful authentication.
 * Exchanges authorization code for tokens and completes the OAuth flow.
 *
 * CRITICAL: Checks if user exists in token database before granting access.
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
        logger.error({ event: "auth_attempt", method: "oauth", success: false, reason: String(error) });
        return c.text("Invalid authorization code", 400);
    }

    // Extract authentication data
    const { accessToken, organizationId, refreshToken, user } = response;

    // Decode JWT to get permissions
    const { permissions = [] } = jose.decodeJwt<AccessToken>(accessToken);

    // CRITICAL: Check if user exists in token database
    const dbUser = await getUserByEmail(c.env.TOKEN_DB, user.email);

    // If user not found in database, reject authorization and show purchase page
    if (!dbUser) {
        logger.warn({ event: "user_lookup", lookup_by: "email", user_email: user.email, found: false });
        return c.html(formatPurchaseRequiredPage(user.email), 403);
    }

    // SECURITY FIX: Defensive check for deleted accounts (belt-and-suspenders approach)
    // This provides defense-in-depth even if getUserByEmail() query is modified
    if (dbUser.is_deleted === 1) {
        logger.warn({ event: "user_lookup", lookup_by: "email", user_email: user.email, user_id: dbUser.user_id, found: false, is_deleted: true });
        return c.html(formatAccountDeletedPage(), 403);
    }

    logger.info({ event: "user_lookup", lookup_by: "email", user_email: user.email, user_id: dbUser.user_id, found: true, balance: dbUser.current_token_balance });

    // Complete OAuth flow and get redirect URL back to MCP client
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthReqInfo,
        userId: user.id,
        metadata: {},
        scope: permissions,

        // Props will be available via `this.props` in your McpAgent class
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

    // Show success page with auto-redirect (provides user feedback)
    logger.info({ event: "auth_attempt", method: "oauth", user_email: user.email, user_id: user.id, success: true });
    return c.html(formatOAuthSuccessPage(user.email, redirectTo), 200);
});

export const AuthkitHandler = app;
