/**
 * Authentication Utilities for MCP Server
 *
 * Simple user lookup and HTML pages for OAuth flow.
 */

/**
 * Query user from database by email address
 */
export async function getUserByEmail(
  db: D1Database,
  email: string
): Promise<{ user_id: string; email: string; is_deleted: number } | null> {
  try {
    const result = await db
      .prepare('SELECT user_id, email, is_deleted FROM users WHERE email = ? AND is_deleted = 0')
      .bind(email)
      .first<{ user_id: string; email: string; is_deleted: number }>();
    return result || null;
  } catch (error) {
    console.error('[Auth] Error querying user:', error);
    return null;
  }
}

/**
 * OAuth success page with auto-redirect
 */
export function formatSuccessPage(email: string, redirectUrl: string): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>OK - {{SERVER_NAME}}</title>
<style>body{font-family:system-ui;background:#667eea;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#fff;border-radius:12px;padding:40px;text-align:center;max-width:400px}
.ok{font-size:64px}.email{color:#3b82f6;font-weight:600}</style></head>
<body><div class="box"><div class="ok">✅</div><h2>Zalogowano!</h2>
<p><span class="email">${e(email)}</span></p>
<p>Przekierowanie...</p></div>
<script>setTimeout(()=>location.href='${e(redirectUrl)}',1500)</script></body></html>`;
}

/**
 * Registration required page
 *
 * @param email - User email that attempted to authenticate
 * @param returnTo - Optional URL to return to after registration
 */
export function formatRegistrationPage(email: string, returnTo?: string): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const registrationUrl = new URL('https://panel.wtyczki.ai/');
  if (returnTo) {
    registrationUrl.searchParams.set('return_to', returnTo);
  }
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Rejestracja - {{SERVER_NAME}}</title>
<style>body{font-family:system-ui;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#fff;border-radius:12px;padding:40px;text-align:center;max-width:400px}
.btn{display:inline-block;background:#3b82f6;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-top:16px}</style></head>
<body><div class="box"><h2>Rejestracja wymagana</h2>
<p>Email: <strong>${e(email)}</strong></p>
<a href="${e(registrationUrl.toString())}" class="btn">Zarejestruj sie</a></div></body></html>`;
}

/**
 * Account deleted page
 */
export function formatDeletedPage(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Konto usuniete</title>
<style>body{font-family:system-ui;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#fff;border-radius:12px;padding:40px;text-align:center;max-width:400px}</style></head>
<body><div class="box"><h2>Konto usuniete</h2>
<p>Utworz nowe na <a href="https://panel.wtyczki.ai/">panel.wtyczki.ai</a></p></div></body></html>`;
}
