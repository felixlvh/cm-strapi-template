import crypto from 'crypto';
import type { Core } from '@strapi/strapi';

// In-memory nonce set for one-time token enforcement
const usedNonces = new Set<string>();

// Clean up expired nonces every 5 minutes
setInterval(() => {
  usedNonces.clear();
}, 5 * 60 * 1000);

export default {
  async callback(ctx: any) {
    const { token, cp, pid } = ctx.query;

    if (!token || typeof token !== 'string') {
      ctx.status = 400;
      ctx.body = errorPage('Missing token');
      return;
    }

    const ssoSecret = process.env.SSO_SECRET;
    if (!ssoSecret) {
      ctx.status = 500;
      ctx.body = errorPage('SSO not configured');
      return;
    }

    // Split token into payload and signature
    const dotIndex = token.lastIndexOf('.');
    if (dotIndex === -1) {
      ctx.status = 400;
      ctx.body = errorPage('Invalid token format');
      return;
    }

    const payloadB64 = token.substring(0, dotIndex);
    const signature = token.substring(dotIndex + 1);

    // Verify HMAC-SHA256 signature using timing-safe comparison
    const expectedSignature = crypto
      .createHmac('sha256', ssoSecret)
      .update(payloadB64)
      .digest('base64url');

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      ctx.status = 403;
      ctx.body = errorPage('Invalid token signature');
      return;
    }

    // Decode and validate payload
    let payload: { email: string; nonce: string; iat: number; exp: number };
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      ctx.status = 400;
      ctx.body = errorPage('Invalid token payload');
      return;
    }

    // Check expiry (30s TTL)
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || now > payload.exp) {
      ctx.status = 403;
      ctx.body = errorPage('Token expired');
      return;
    }

    // Check one-time nonce
    if (!payload.nonce || usedNonces.has(payload.nonce)) {
      ctx.status = 403;
      ctx.body = errorPage('Token already used');
      return;
    }
    usedNonces.add(payload.nonce);

    if (!payload.email) {
      ctx.status = 400;
      ctx.body = errorPage('Missing email in token');
      return;
    }

    const strapi: Core.Strapi = (ctx as any).strapi || (global as any).strapi;

    // Find admin user by email
    let adminUser: any;
    try {
      adminUser = await strapi.query('admin::user').findOne({
        where: { email: payload.email },
        populate: ['roles'],
      });
    } catch {
      adminUser = null;
    }

    // Auto-create admin user if not found (handles backfill for pre-SSO projects)
    if (!adminUser) {
      try {
        const roles = await strapi.query('admin::role').findMany();
        const superAdminRole = roles.find(
          (role: any) => role.code === 'strapi-super-admin'
        );

        if (!superAdminRole) {
          ctx.status = 500;
          ctx.body = errorPage('Super Admin role not found');
          return;
        }

        const randomPassword = crypto.randomBytes(32).toString('hex');
        const hashedPassword = await strapi.service('admin::auth').hashPassword(randomPassword);
        adminUser = await strapi.query('admin::user').create({
          data: {
            email: payload.email,
            firstname: process.env.CM_ADMIN_FIRST_NAME || 'Admin',
            lastname: process.env.CM_ADMIN_LAST_NAME || '',
            password: hashedPassword,
            isActive: true,
            roles: [superAdminRole.id],
          },
          populate: ['roles'],
        });

        strapi.log.info(`SSO: Auto-created admin user for ${payload.email}`);
      } catch (error) {
        strapi.log.error('SSO: Failed to auto-create admin user');
        strapi.log.error(error);
        ctx.status = 500;
        ctx.body = errorPage('Failed to create admin account');
        return;
      }
    }

    // Create admin session using Strapi 5 session manager
    let accessToken: string;
    try {
      const sessionManager = (strapi as any).sessionManager;
      if (!sessionManager) {
        throw new Error('Session manager not available');
      }

      const userId = String(adminUser.id);
      const deviceId = crypto.randomUUID();

      // Generate refresh token and set it as httpOnly cookie
      const { token: refreshToken, absoluteExpiresAt } = await sessionManager('admin').generateRefreshToken(
        userId, deviceId, { type: 'session' }
      );

      ctx.cookies.set('strapi_admin_refresh', refreshToken, {
        httpOnly: true,
        secure: ctx.request.secure && process.env.NODE_ENV === 'production',
        overwrite: true,
        path: '/admin',
        sameSite: 'lax',
      });

      // Generate access token from the refresh token
      const accessResult = await sessionManager('admin').generateAccessToken(refreshToken);
      if ('error' in accessResult) {
        throw new Error('Failed to generate access token');
      }
      accessToken = accessResult.token;
    } catch (error) {
      strapi.log.error('SSO: Failed to create admin session');
      strapi.log.error(error);
      ctx.status = 500;
      ctx.body = errorPage('Failed to create session');
      return;
    }

    // Return HTML that writes accessToken to localStorage and redirects to /admin
    ctx.type = 'text/html';
    ctx.body = brandedPage({
      title: 'Signing in...',
      message: 'Signing in...',
      showSpinner: true,
      script: `
try {
  localStorage.setItem('jwtToken', ${JSON.stringify(JSON.stringify(accessToken))});
  ${cp ? `localStorage.setItem('sso_cp_url', ${JSON.stringify(String(cp))});` : ''}
  ${cp && pid ? `localStorage.setItem('sso_login_url', ${JSON.stringify(`${String(cp)}/api/projects/${String(pid)}/sso`)});` : ''}
  window.location.replace('/admin');
} catch (e) {
  document.body.textContent = 'SSO login failed: ' + e.message;
}`,
    });
  },

  /**
   * POST /api/sso/revoke-all — revoke all admin sessions for the email in the signed token.
   * Called by the control plane during sign-out so Strapi sessions die immediately.
   */
  async revokeAll(ctx: any) {
    const { token } = ctx.query;

    if (!token || typeof token !== 'string') {
      ctx.status = 400;
      ctx.body = { error: 'Missing token' };
      return;
    }

    const ssoSecret = process.env.SSO_SECRET;
    if (!ssoSecret) {
      ctx.status = 500;
      ctx.body = { error: 'SSO not configured' };
      return;
    }

    // Verify HMAC-SHA256 signature (same as callback)
    const dotIndex = token.lastIndexOf('.');
    if (dotIndex === -1) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid token' };
      return;
    }

    const payloadB64 = token.substring(0, dotIndex);
    const signature = token.substring(dotIndex + 1);

    const expectedSignature = crypto
      .createHmac('sha256', ssoSecret)
      .update(payloadB64)
      .digest('base64url');

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      ctx.status = 403;
      ctx.body = { error: 'Invalid signature' };
      return;
    }

    let payload: { email: string; nonce: string; iat: number; exp: number };
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      ctx.status = 400;
      ctx.body = { error: 'Invalid payload' };
      return;
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || now > payload.exp) {
      ctx.status = 403;
      ctx.body = { error: 'Token expired' };
      return;
    }

    // One-time nonce
    if (!payload.nonce || usedNonces.has(payload.nonce)) {
      ctx.status = 403;
      ctx.body = { error: 'Token already used' };
      return;
    }
    usedNonces.add(payload.nonce);

    const strapi: Core.Strapi = (ctx as any).strapi || (global as any).strapi;

    // Find admin user and revoke all their sessions
    try {
      const adminUser = await strapi.query('admin::user').findOne({
        where: { email: payload.email },
      });

      if (adminUser) {
        const sessionManager = (strapi as any).sessionManager;
        if (sessionManager) {
          await sessionManager('admin').invalidateRefreshToken(String(adminUser.id));
          strapi.log.info(`SSO: Revoked all sessions for ${payload.email}`);
        }
      }
    } catch (error) {
      strapi.log.error('SSO: Failed to revoke sessions');
      strapi.log.error(error);
    }

    // Clear the refresh cookie too
    ctx.cookies.set('strapi_admin_refresh', '', {
      httpOnly: true,
      overwrite: true,
      path: '/admin',
      sameSite: 'lax',
      expires: new Date(0),
    });

    ctx.status = 200;
    ctx.body = { success: true };
  },

  /**
   * GET /api/sso/config — returns SSO configuration (CP URL + project ID)
   * so the admin app.tsx can construct the SSO login URL on first visit.
   */
  async config(ctx: any) {
    const cpUrl = process.env.SSO_CP_URL;
    const projectPublicId = process.env.SSO_PROJECT_PUBLIC_ID;

    if (!cpUrl || !projectPublicId) {
      ctx.status = 404;
      ctx.body = { error: 'SSO not configured' };
      return;
    }

    ctx.body = {
      cpUrl,
      projectPublicId,
      ssoLoginUrl: `${cpUrl}/api/projects/${projectPublicId}/sso`,
    };
  },

  /**
   * GET /api/sso/sign-out?token=...&next=...
   * Browser-visited endpoint that clears localStorage + cookies on this Strapi domain,
   * then redirects the browser to the `next` URL (next Strapi or final CP sign-out).
   */
  async signOut(ctx: any) {
    const { token, next } = ctx.query;

    // Default fallback: just go to /admin
    const fallbackUrl = '/admin';
    const nextUrl = (next && typeof next === 'string') ? next : fallbackUrl;

    if (!token || typeof token !== 'string') {
      // No token — still clear local state and redirect
      ctx.type = 'text/html';
      ctx.body = signOutPage(nextUrl);
      return;
    }

    const ssoSecret = process.env.SSO_SECRET;
    if (!ssoSecret) {
      ctx.type = 'text/html';
      ctx.body = signOutPage(nextUrl);
      return;
    }

    // Verify HMAC-SHA256 signature
    const dotIndex = token.lastIndexOf('.');
    if (dotIndex !== -1) {
      const payloadB64 = token.substring(0, dotIndex);
      const signature = token.substring(dotIndex + 1);

      const expectedSignature = crypto
        .createHmac('sha256', ssoSecret)
        .update(payloadB64)
        .digest('base64url');

      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (
        sigBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(sigBuffer, expectedBuffer)
      ) {
        // Token is valid — also revoke server-side sessions
        try {
          const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
          if (payload.email) {
            const strapi: Core.Strapi = (ctx as any).strapi || (global as any).strapi;
            const adminUser = await strapi.query('admin::user').findOne({
              where: { email: payload.email },
            });
            if (adminUser) {
              const sessionManager = (strapi as any).sessionManager;
              if (sessionManager) {
                await sessionManager('admin').invalidateRefreshToken(String(adminUser.id));
                strapi.log.info(`SSO sign-out: Revoked sessions for ${payload.email}`);
              }
            }
          }
        } catch (error) {
          // Best-effort revocation; still clear client state
          const strapi: Core.Strapi = (ctx as any).strapi || (global as any).strapi;
          strapi.log.error('SSO sign-out: Failed to revoke sessions', error);
        }
      }
    }

    // Clear the refresh cookie
    ctx.cookies.set('strapi_admin_refresh', '', {
      httpOnly: true,
      overwrite: true,
      path: '/admin',
      sameSite: 'lax',
      expires: new Date(0),
    });

    ctx.type = 'text/html';
    ctx.body = signOutPage(nextUrl);
  },
};

/**
 * Returns an HTML page that clears all SSO-related localStorage keys
 * and redirects the browser to the next URL in the sign-out chain.
 */
function signOutPage(nextUrl: string): string {
  return brandedPage({
    title: 'Signing out...',
    message: 'Signing out...',
    showSpinner: true,
    script: `
try {
  localStorage.removeItem('jwtToken');
  localStorage.removeItem('sso_cp_url');
  localStorage.removeItem('sso_login_url');
  localStorage.removeItem('STRAPI_NPS_SURVEY_SETTINGS');
} catch(e) {}
window.location.replace(${JSON.stringify(nextUrl)});`,
  });
}

function errorPage(message: string): string {
  return brandedPage({
    title: 'SSO Error',
    message: escapeHtml(message),
    showSpinner: false,
    isError: true,
    linkHref: '/admin',
    linkText: 'Go to admin',
  });
}

const CM_LOGO_SVG = `<svg width="48" height="48" viewBox="0 0 328 329" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect y="0.5" width="328" height="328" rx="164" fill="#cb6441"/>
  <path d="M165.018 72.3008V132.771C165.018 152.653 148.9 168.771 129.018 168.771H70.2288" stroke="white" stroke-width="20"/>
  <path d="M166.627 265.241L166.627 204.771C166.627 184.889 182.744 168.771 202.627 168.771L261.416 168.771" stroke="white" stroke-width="20"/>
  <line x1="238.136" y1="98.8184" x2="196.76" y2="139.707" stroke="white" stroke-width="20"/>
  <line x1="135.688" y1="200.957" x2="94.3128" y2="241.845" stroke="white" stroke-width="20"/>
  <line x1="133.689" y1="137.524" x2="92.5566" y2="96.3914" stroke="white" stroke-width="20"/>
  <line x1="237.679" y1="241.803" x2="196.547" y2="200.671" stroke="white" stroke-width="20"/>
</svg>`;

function brandedPage(opts: {
  title: string;
  message: string;
  showSpinner: boolean;
  isError?: boolean;
  linkHref?: string;
  linkText?: string;
  script?: string;
}): string {
  const { title, message, showSpinner, isError, linkHref, linkText, script } = opts;
  const spinnerHtml = showSpinner
    ? `<div style="width:36px;height:36px;margin:20px auto 0;border:3px solid #dcdce4;border-top-color:#cb6441;border-radius:50%;animation:cm-spin 0.8s linear infinite;"></div>`
    : '';
  const errorHeading = isError
    ? `<p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#32324d;">SSO Login Failed</p>`
    : '';
  const linkHtml = linkHref && linkText
    ? `<a href="${linkHref}" style="display:inline-block;margin-top:20px;padding:8px 20px;background:#cb6441;color:#fff;border-radius:6px;font-size:14px;text-decoration:none;">` +
      `${linkText}</a>`
    : '';
  const scriptHtml = script ? `<script>${script}</script>` : '';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f6f6f9;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
@keyframes cm-spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(33,33,52,0.1);padding:40px 48px;text-align:center;max-width:400px;width:100%;">
  ${CM_LOGO_SVG}
  <p style="margin:12px 0 0;font-size:13px;font-weight:600;color:#32324d;letter-spacing:0.5px;">Content Metric</p>
  ${errorHeading}
  ${spinnerHtml}
  <p style="margin-top:16px;font-size:14px;color:#666687;">${message}</p>
  ${linkHtml}
</div>
${scriptHtml}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
