// src/views/customLoginPage.ts - Custom Magic Auth Login UI
//
// Custom branded login for NBP Exchange MCP Server
// This provides full control over branding, messaging, and user experience.
//
// See docs/CUSTOM_LOGIN_GUIDE.md for implementation guide.

/**
 * Render custom email input form (Step 1 of custom login)
 *
 * Shows branded login page with email input field.
 * User enters email → submits to /auth/login-custom/send-code
 *
 * @param error - Optional error message to display
 * @param returnTo - URL to redirect after successful login (for OAuth flow)
 * @returns HTML string for email input form
 */
export function renderLoginEmailForm(error?: string, returnTo: string = '/dashboard'): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In - NBP Exchange MCP</title>

  <!-- Google Fonts: DM Sans -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      color: #1a202c;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .container {
      max-width: 400px;
      width: 100%;
    }

    .logo {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #1a202c;
    }

    .logo p {
      color: rgba(26, 32, 44, 0.7);
      font-size: 14px;
    }

    .card {
      background: white;
      border: 2px solid #e2e8f0;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    }

    h2 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 24px;
      text-align: center;
      color: #1a202c;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
      color: #1a202c;
    }

    input[type="email"] {
      width: 100%;
      padding: 14px 16px;
      font-size: 16px;
      background: white;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      color: #1a202c;
      outline: none;
      transition: all 0.2s;
      font-family: 'DM Sans', sans-serif;
    }

    input[type="email"]:focus {
      border-color: #059669;
      box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.1);
    }

    button {
      width: 100%;
      padding: 14px 16px;
      font-size: 16px;
      font-weight: 600;
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-family: 'DM Sans', sans-serif;
    }

    button:hover {
      background: linear-gradient(135deg, #047857 0%, #065f46 100%);
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(5, 150, 105, 0.3);
    }

    button:active {
      transform: translateY(0);
    }

    .error {
      background: #fee2e2;
      border: 2px solid #fecaca;
      color: #991b1b;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
    }

    .error a {
      color: #991b1b;
      font-weight: 600;
      text-decoration: underline;
    }

    .info {
      background: #ecfdf5;
      border: 2px solid #d1fae5;
      color: #065f46;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
    }

    .info a {
      color: #047857;
      font-weight: 600;
      text-decoration: none;
    }

    .info a:hover {
      text-decoration: underline;
    }

    .footer {
      text-align: center;
      margin-top: 24px;
      font-size: 14px;
      color: rgba(26, 32, 44, 0.7);
    }

    .footer a {
      color: #059669;
      text-decoration: none;
      font-weight: 600;
    }

    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>💱 NBP Exchange MCP</h1>
      <p>Polish National Bank Currency Data</p>
    </div>

    <div class="card">
      <h2>Sign In</h2>

      ${error ? `
        <div class="error">
          ⚠️ ${error}
        </div>
      ` : ''}

      <div class="info">
        💡 Don't have an account? <a href="https://panel.wtyczki.ai/">Purchase tokens here →</a>
      </div>

      <form method="POST" action="/auth/login-custom/send-code">
        <input type="hidden" name="return_to" value="${returnTo}" />

        <div class="form-group">
          <label for="email">Email Address</label>
          <input
            type="email"
            name="email"
            id="email"
            placeholder="your@email.com"
            autocomplete="username"
            autofocus
            required
          />
        </div>

        <button type="submit">Send Verification Code</button>
      </form>
    </div>

    <div class="footer">
      First time here? <a href="https://panel.wtyczki.ai/">Start by purchasing tokens</a>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Render custom code verification form (Step 2 of custom login)
 *
 * Shows code input form after Magic Auth email was sent.
 * User enters 6-digit code → submits to /auth/login-custom/verify-code
 *
 * @param email - User's email address (displayed for context)
 * @param error - Optional error message to display
 * @param returnTo - URL to redirect after successful login
 * @returns HTML string for code verification form
 */
export function renderLoginCodeForm(email: string, error?: string, returnTo: string = '/dashboard'): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Enter Code - NBP Exchange MCP</title>

  <!-- Google Fonts: DM Sans -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      color: #1a202c;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .container {
      max-width: 400px;
      width: 100%;
    }

    .logo {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #1a202c;
    }

    .logo p {
      color: rgba(26, 32, 44, 0.7);
      font-size: 14px;
    }

    .card {
      background: white;
      border: 2px solid #e2e8f0;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    }

    h2 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
      text-align: center;
      color: #1a202c;
    }

    .subtitle {
      text-align: center;
      color: rgba(26, 32, 44, 0.7);
      font-size: 14px;
      margin-bottom: 24px;
    }

    .subtitle strong {
      color: #1a202c;
      font-weight: 600;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
      color: #1a202c;
    }

    input[type="text"] {
      width: 100%;
      padding: 16px;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: 8px;
      text-align: center;
      background: white;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      color: #1a202c;
      outline: none;
      transition: all 0.2s;
      font-family: 'DM Sans', monospace;
    }

    input[type="text"]:focus {
      border-color: #059669;
      box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.1);
    }

    button {
      width: 100%;
      padding: 14px 16px;
      font-size: 16px;
      font-weight: 600;
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-family: 'DM Sans', sans-serif;
    }

    button:hover {
      background: linear-gradient(135deg, #047857 0%, #065f46 100%);
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(5, 150, 105, 0.3);
    }

    button:active {
      transform: translateY(0);
    }

    .error {
      background: #fee2e2;
      border: 2px solid #fecaca;
      color: #991b1b;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
    }

    .success {
      background: #d1fae5;
      border: 2px solid #a7f3d0;
      color: #065f46;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
    }

    .info {
      background: #ecfdf5;
      border: 2px solid #d1fae5;
      color: #065f46;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      text-align: center;
    }

    .footer {
      text-align: center;
      margin-top: 24px;
      font-size: 14px;
      color: rgba(26, 32, 44, 0.7);
    }

    .footer a {
      color: #059669;
      text-decoration: none;
      font-weight: 600;
    }

    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>💱 NBP Exchange MCP</h1>
      <p>Polish National Bank Currency Data</p>
    </div>

    <div class="card">
      <h2>Enter Verification Code</h2>
      <p class="subtitle">Sent to <strong>${email}</strong></p>

      ${error ? `
        <div class="error">
          ⚠️ ${error}
        </div>
      ` : ''}

      <div class="success">
        ✅ Code sent! Check your email inbox.
      </div>

      <div class="info">
        ⏱️ Code expires in 10 minutes
      </div>

      <form method="POST" action="/auth/login-custom/verify-code">
        <input type="hidden" name="email" value="${email}" />
        <input type="hidden" name="return_to" value="${returnTo}" />

        <div class="form-group">
          <label for="code">6-Digit Code</label>
          <input
            type="text"
            name="code"
            id="code"
            placeholder="000000"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="^\\d{6}$"
            maxlength="6"
            autofocus
            required
          />
        </div>

        <button type="submit">Sign In</button>
      </form>
    </div>

    <div class="footer">
      Didn't receive the code? <a href="/auth/login-custom">Resend</a>
    </div>
  </div>
</body>
</html>
  `;
}
