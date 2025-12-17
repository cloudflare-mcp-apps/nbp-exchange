/**
 * OAuth Handler for MCP Server
 *
 * Handles WorkOS AuthKit authentication with centralized login support.
 * Implements 30-day sessions with automatic token refresh.
 */

import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import * as jose from "jose";
import { type AccessToken, type AuthenticationResponse, WorkOS } from "@workos-inc/node";
import type { Env } from "../types";
import type { Props } from "./props";
import { getUserByEmail, formatSuccessPage, formatRegistrationPage, formatDeletedPage } from "./auth-utils";
import {
  type WorkOSSession,
  type SessionValidationResult,
  SESSION_DURATION_MS,
  SESSION_DURATION_SECONDS,
} from "./session-types";

const app = new Hono<{
  Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers };
  Variables: { workOS: WorkOS };
}>();

app.use(async (c, next) => {
  c.set("workOS", new WorkOS(c.env.WORKOS_API_KEY));
  await next();
});

/**
 * Validate session and attempt refresh if expired
 *
 * @param sessionToken - The session token from cookie
 * @param env - Environment bindings
 * @param workOS - WorkOS SDK instance
 * @returns Validation result with session if valid
 */
async function validateAndRefreshSession(
  sessionToken: string,
  env: Env,
  workOS: WorkOS
): Promise<SessionValidationResult> {
  const session = await env.USER_SESSIONS.get(
    `workos_session:${sessionToken}`,
    'json'
  ) as WorkOSSession | null;

  if (!session) {
    return { valid: false, reason: 'NO_SESSION' };
  }

  // Check if session expired
  if (session.expires_at < Date.now()) {
    // Try refresh if refresh_token exists
    if (session.refresh_token) {
      try {
        const newAuth = await workOS.userManagement.authenticateWithRefreshToken({
          clientId: env.WORKOS_CLIENT_ID,
          refreshToken: session.refresh_token,
        });

        // Update session with new tokens
        const newSession: WorkOSSession = {
          ...session,
          refresh_token: newAuth.refreshToken,
          expires_at: Date.now() + SESSION_DURATION_MS,
          last_accessed_at: Date.now(),
        };

        await env.USER_SESSIONS.put(
          `workos_session:${sessionToken}`,
          JSON.stringify(newSession),
          { expirationTtl: SESSION_DURATION_SECONDS }
        );

        console.log('[Auth] Session refreshed for:', session.email);
        return { valid: true, session: newSession };
      } catch (error) {
        console.error('[Auth] Session refresh failed:', error);
        return { valid: false, reason: 'REFRESH_FAILED' };
      }
    }
    return { valid: false, reason: 'EXPIRED' };
  }

  // Valid session - update last_accessed_at
  const updatedSession: WorkOSSession = {
    ...session,
    last_accessed_at: Date.now(),
  };

  await env.USER_SESSIONS.put(
    `workos_session:${sessionToken}`,
    JSON.stringify(updatedSession),
    { expirationTtl: SESSION_DURATION_SECONDS }
  );

  return { valid: true, session: updatedSession };
}

// GET /authorize
app.get("/authorize", async (c) => {
  const oauthReq = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  if (!oauthReq.clientId) return c.text("Invalid request", 400);

  const cookies = Object.fromEntries(
    (c.req.header('Cookie') || '').split(';').map(s => s.trim().split('='))
  );
  const sessionToken = cookies['workos_session'];

  // Session flow (centralized login with auto-refresh)
  if (sessionToken && c.env.USER_SESSIONS) {
    const result = await validateAndRefreshSession(
      sessionToken,
      c.env,
      c.get("workOS")
    );

    // Invalid or expired session - redirect to login
    if (!result.valid) {
      const url = new URL('https://panel.wtyczki.ai/auth/login-custom');
      url.searchParams.set('return_to', c.req.url);
      return Response.redirect(url.toString(), 302);
    }

    const session = result.session!;

    // Verify user exists in database
    const dbUser = await getUserByEmail(c.env.TOKEN_DB, session.email);
    if (!dbUser) return c.html(formatRegistrationPage(session.email, c.req.url), 403);
    if (dbUser.is_deleted === 1) return c.html(formatDeletedPage(), 403);

    // Complete OAuth authorization
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReq,
      userId: session.user_id,
      metadata: {},
      scope: [],
      props: {
        accessToken: '', organizationId: undefined, permissions: [], refreshToken: session.refresh_token,
        user: {
          id: session.user_id, email: session.email, emailVerified: true,
          profilePictureUrl: null, firstName: null, lastName: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          lastSignInAt: new Date().toISOString(), locale: null, externalId: null,
          metadata: {}, object: 'user' as const,
        },
        userId: dbUser.user_id, email: dbUser.email,
      } satisfies Props,
    });
    return c.html(formatSuccessPage(session.email, redirectTo), 200);
  }

  // No session - redirect to centralized login or fallback to WorkOS
  if (!c.env.USER_SESSIONS) {
    const state = btoa(JSON.stringify(oauthReq));
    return Response.redirect(
      c.get("workOS").userManagement.getAuthorizationUrl({
        provider: "authkit",
        clientId: c.env.WORKOS_CLIENT_ID,
        redirectUri: new URL("/callback", c.req.url).href,
        state,
      }),
    );
  }

  const url = new URL('https://panel.wtyczki.ai/auth/login-custom');
  url.searchParams.set('return_to', c.req.url);
  return Response.redirect(url.toString(), 302);
});

// GET /callback (WorkOS fallback)
app.get("/callback", async (c) => {
  const oauthReq = JSON.parse(atob(c.req.query("state") as string)) as AuthRequest;
  if (!oauthReq.clientId) return c.text("Invalid state", 400);

  const code = c.req.query("code");
  if (!code) return c.text("Missing code", 400);

  let response: AuthenticationResponse;
  try {
    response = await c.get("workOS").userManagement.authenticateWithCode({
      clientId: c.env.WORKOS_CLIENT_ID,
      code,
    });
  } catch {
    return c.text("Auth failed", 400);
  }

  const { accessToken, organizationId, refreshToken, user } = response;
  const { permissions = [] } = jose.decodeJwt<AccessToken>(accessToken);

  const dbUser = await getUserByEmail(c.env.TOKEN_DB, user.email);
  if (!dbUser) return c.html(formatRegistrationPage(user.email), 403);
  if (dbUser.is_deleted === 1) return c.html(formatDeletedPage(), 403);

  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReq,
    userId: user.id,
    metadata: {},
    scope: permissions,
    props: {
      accessToken, organizationId, permissions, refreshToken, user,
      userId: dbUser.user_id, email: dbUser.email,
    } satisfies Props,
  });

  return c.html(formatSuccessPage(user.email, redirectTo), 200);
});

export const AuthkitHandler = app;
