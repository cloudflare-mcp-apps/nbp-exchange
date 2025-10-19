// src/routes/customAuth.ts - Custom Magic Auth Endpoints

import { WorkOS } from '@workos-inc/node';
import type { Env } from '../types';
import { renderLoginEmailForm, renderLoginCodeForm } from '../views/customLoginPage';
import { getUserByEmail } from '../tokenUtils';

/**
 * Show email input form (Step 1)
 */
export async function handleCustomLoginPage(request: Request): Promise<Response> {
  // Get return_to parameter from query string (for OAuth redirect after login)
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('return_to') || '/dashboard';

  return new Response(renderLoginEmailForm(undefined, returnTo), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

/**
 * Handle email submission - Check if user exists, then send Magic Auth code (Step 2)
 */
export async function handleSendMagicAuthCode(request: Request, env: Env): Promise<Response> {
  try {
    // Parse form data
    const formData = await request.formData();
    const email = formData.get('email')?.toString().trim();
    const returnTo = formData.get('return_to')?.toString() || '/dashboard';

    if (!email) {
      return new Response(renderLoginEmailForm('Please provide an email address', returnTo), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(renderLoginEmailForm('Invalid email address format', returnTo), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    console.log(`🔐 [custom-auth] Email submitted: ${email}`);

    // CRITICAL: Check if user exists in token database
    const existingUser = await getUserByEmail(env.DB, email);

    if (!existingUser) {
      console.log(`❌ [custom-auth] User not found in database: ${email}`);

      // User doesn't exist - show error with purchase link
      return new Response(renderLoginEmailForm(
        'No account found for this email address. <a href="https://panel.wtyczki.ai" style="font-weight: 600; text-decoration: underline;">Purchase tokens to create account →</a>',
        returnTo
      ), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    console.log(`✅ [custom-auth] User found in database: ${existingUser.user_id}`);

    // User exists - send Magic Auth code via WorkOS API
    const workos = new WorkOS(env.WORKOS_API_KEY);

    console.log(`🔄 [custom-auth] Sending Magic Auth code to: ${email}`);

    const magicAuth = await workos.userManagement.createMagicAuth({
      email,
    });

    console.log(`✅ [custom-auth] Magic Auth code created: ${magicAuth.id}`);
    console.log(`   Code expires at: ${magicAuth.expiresAt}`);

    // Show code input form with return_to parameter
    return new Response(renderLoginCodeForm(email, undefined, returnTo), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });

  } catch (error) {
    console.error('❌ [custom-auth] Error sending Magic Auth code:', error);

    const returnTo = (await request.clone().formData()).get('return_to')?.toString() || '/dashboard';

    return new Response(renderLoginEmailForm('An error occurred. Please try again later.', returnTo), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

/**
 * Handle code verification - Validate code and create session (Step 3)
 */
export async function handleVerifyMagicAuthCode(request: Request, env: Env): Promise<Response> {
  try {
    // Parse form data
    const formData = await request.formData();
    const email = formData.get('email')?.toString().trim();
    const code = formData.get('code')?.toString().trim();
    const returnTo = formData.get('return_to')?.toString() || '/dashboard';

    if (!email || !code) {
      return new Response(renderLoginCodeForm(email || '', 'Please provide the verification code', returnTo), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(code)) {
      return new Response(renderLoginCodeForm(email, 'Code must be 6 digits', returnTo), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    console.log(`🔐 [custom-auth] Verifying code for: ${email}`);

    // Authenticate with WorkOS using Magic Auth code
    const workos = new WorkOS(env.WORKOS_API_KEY);

    const { user: workosUser, accessToken, refreshToken } = await workos.userManagement.authenticateWithMagicAuth({
      clientId: env.WORKOS_CLIENT_ID,
      code,
      email,
    });

    console.log(`✅ [custom-auth] WorkOS authentication successful: ${workosUser.email}`);
    console.log(`   WorkOS user ID: ${workosUser.id}`);

    // Load user from token database
    const dbUser = await getUserByEmail(env.DB, email);

    if (!dbUser) {
      console.error(`❌ [custom-auth] User not found in database after authentication: ${email}`);
      return new Response(renderLoginCodeForm(email, 'Account not found. Please contact support.', returnTo), {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Update last login timestamp
    await env.DB.prepare(
      'UPDATE users SET last_login_at = ? WHERE user_id = ?'
    ).bind(new Date().toISOString(), dbUser.user_id).run();

    console.log(`✅ [custom-auth] User loaded from database: ${dbUser.user_id}`);

    // Create session token
    const sessionToken = crypto.randomUUID();

    // Store session in KV (if USER_SESSIONS is configured)
    if (env.USER_SESSIONS) {
      const session = {
        user_id: dbUser.user_id,
        email: dbUser.email,
        workos_user_id: workosUser.id,
        access_token: accessToken,
        refresh_token: refreshToken,
        created_at: Date.now(),
        expires_at: Date.now() + (72 * 60 * 60 * 1000), // 72 hours
      };

      await env.USER_SESSIONS.put(
        `workos_session:${sessionToken}`,
        JSON.stringify(session),
        { expirationTtl: 259200 } // 72 hours
      );

      console.log(`🎫 [custom-auth] Session created: ${sessionToken.substring(0, 8)}...`);
    } else {
      console.warn('⚠️ [custom-auth] USER_SESSIONS KV not configured - session not stored');
    }

    console.log(`🔄 [custom-auth] Redirecting to: ${returnTo}`);

    // Set session cookie and redirect to return_to URL (OAuth callback or dashboard)
    const headers = new Headers();
    headers.append('Location', returnTo);
    headers.append('Set-Cookie', `workos_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=259200`);

    return new Response(null, {
      status: 302,
      headers,
    });

  } catch (error) {
    console.error('❌ [custom-auth] Error verifying code:', error);

    const formData = await request.clone().formData();
    const email = formData.get('email')?.toString() || '';
    const returnTo = formData.get('return_to')?.toString() || '/dashboard';

    // Check for specific WorkOS errors
    let errorMessage = 'Invalid or expired code. Please try again.';

    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        errorMessage = 'Code has expired. Go back and request a new code.';
      } else if (error.message.includes('invalid')) {
        errorMessage = 'Invalid code. Please check the code and try again.';
      }
    }

    return new Response(renderLoginCodeForm(email, errorMessage, returnTo), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}
