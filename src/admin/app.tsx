import type { StrapiApp } from '@strapi/strapi/admin';

import AuthLogo from './extensions/cm-logo.svg';
import MenuLogo from './extensions/cm-logo.svg';

export default {
  config: {
    auth: {
      logo: AuthLogo,
    },
    menu: {
      logo: MenuLogo,
    },
    head: {
      favicon: '/extensions/favicon.png',
    },
    theme: {
      light: {
        colors: {
          primary100: '#fef3ef',
          primary200: '#f9d2c3',
          primary500: '#cb6441',
          primary600: '#b45839',
          primary700: '#9a4b31',
          buttonPrimary500: '#cb6441',
          buttonPrimary600: '#b45839',
        },
      },
      dark: {
        colors: {
          primary100: '#2a1a13',
          primary200: '#3d2518',
          primary500: '#cb6441',
          primary600: '#d4795c',
          primary700: '#dd8e77',
          buttonPrimary500: '#cb6441',
          buttonPrimary600: '#d4795c',
        },
      },
    },
    locales: [],
    translations: {
      en: {
        'Auth.form.welcome.title': 'Welcome to Content Metric',
        'Auth.form.welcome.subtitle': 'Log in to your Content Metric account',
        'Auth.form.register.subtitle': 'Credentials are only used to authenticate in Content Metric. All saved data will be stored in your database.',
        'app.components.LeftMenu.navbrand.title': 'Content Metric',
        'app.components.LeftMenu.navbrand.workplace': 'Dashboard',
        'Settings.application.strapiVersion': 'Version',
        'Settings.application.ee.admin-seats.count': '{count} seats available',
      },
    },
  },
  bootstrap(app: StrapiApp) {
    document.title = 'Content Metric';

    // Detect server restart / mode switch by comparing loaded scripts against served HTML
    const loadedScripts = Array.from(document.querySelectorAll('script[type="module"][src]'))
      .map(s => s.getAttribute('src')!)
      .filter(Boolean);
    if (loadedScripts.length > 0) {
      const checkForNewBuild = async () => {
        try {
          const res = await fetch('/admin/', { cache: 'no-store' });
          if (!res.ok) return;
          const html = await res.text();
          const stillValid = loadedScripts.some(src => html.includes(src));
          if (!stillValid) {
            const last = sessionStorage.getItem('cm_chunk_reload');
            if (!last || Date.now() - Number(last) > 30000) {
              sessionStorage.setItem('cm_chunk_reload', String(Date.now()));
              window.location.reload();
            }
          }
        } catch { /* server down, retry next interval */ }
      };
      setInterval(checkForNewBuild, 15000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForNewBuild();
      });
    }

    const observer = new MutationObserver(() => {
      if (document.title.includes('Strapi')) {
        document.title = document.title.replace(/Strapi Admin/g, 'Content Metric').replace(/\| Strapi/g, '| Content Metric');
      }
    });
    const titleEl = document.querySelector('title');
    if (titleEl) {
      observer.observe(titleEl, { childList: true });
    }

    if (!document.querySelector('link[rel="icon"]')) {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.href = '/admin/favicon.png';
      document.head.appendChild(link);
    }

    // SSO: Auto-redirect to CP SSO login when no token
    const cpUrl = localStorage.getItem('sso_cp_url');
    const ssoLoginUrl = localStorage.getItem('sso_login_url');
    const hasToken = !!localStorage.getItem('jwtToken');

    if (!hasToken) {
      // Show interstitial immediately to hide the Strapi login page
      const overlay = document.createElement('div');
      overlay.id = 'sso-loading-overlay';
      overlay.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100vh;width:100vw;position:fixed;top:0;left:0;z-index:999999;background:#f6f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
          <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(33,33,52,0.1);padding:40px 48px;text-align:center;max-width:400px;width:100%;">
            <svg width="48" height="48" viewBox="0 0 328 329" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect y="0.5" width="328" height="328" rx="164" fill="#cb6441"/>
              <path d="M165.018 72.3008V132.771C165.018 152.653 148.9 168.771 129.018 168.771H70.2288" stroke="white" stroke-width="20"/>
              <path d="M166.627 265.241L166.627 204.771C166.627 184.889 182.744 168.771 202.627 168.771L261.416 168.771" stroke="white" stroke-width="20"/>
              <line x1="238.136" y1="98.8184" x2="196.76" y2="139.707" stroke="white" stroke-width="20"/>
              <line x1="135.688" y1="200.957" x2="94.3128" y2="241.845" stroke="white" stroke-width="20"/>
              <line x1="133.689" y1="137.524" x2="92.5566" y2="96.3914" stroke="white" stroke-width="20"/>
              <line x1="237.679" y1="241.803" x2="196.547" y2="200.671" stroke="white" stroke-width="20"/>
            </svg>
            <p style="margin:12px 0 0;font-size:13px;font-weight:600;color:#32324d;letter-spacing:0.5px;">Content Metric</p>
            <div style="width:36px;height:36px;margin:20px auto 0;border:3px solid #dcdce4;border-top-color:#cb6441;border-radius:50%;animation:sso-spin 0.8s linear infinite;"></div>
            <p style="margin-top:16px;font-size:14px;color:#666687;">Redirecting to login...</p>
          </div>
        </div>
        <style>@keyframes sso-spin{to{transform:rotate(360deg)}}</style>
      `;
      document.body.appendChild(overlay);

      const removeOverlay = () => {
        const el = document.getElementById('sso-loading-overlay');
        if (el) el.remove();
      };

      if (ssoLoginUrl) {
        window.location.href = ssoLoginUrl;
        return;
      }

      // Fetch config from server to get the SSO login URL
      fetch('/api/sso/config')
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.ssoLoginUrl && data?.cpUrl) {
            localStorage.setItem('sso_cp_url', data.cpUrl);
            localStorage.setItem('sso_login_url', data.ssoLoginUrl);
            window.location.href = data.ssoLoginUrl;
          } else {
            // SSO not configured — fall through to normal login
            removeOverlay();
          }
        })
        .catch(() => {
          removeOverlay();
        });
      return;
    }

    // SSO: Monitor for logout - when jwtToken is removed, redirect to CP sign-out
    if (!cpUrl) return;

    let prevToken = localStorage.getItem('jwtToken');
    const interval = setInterval(() => {
      const currentToken = localStorage.getItem('jwtToken');
      if (prevToken && !currentToken) {
        clearInterval(interval);
        window.location.href = cpUrl + '/api/auth/sso-sign-out';
      }
      prevToken = currentToken;
    }, 500);

    // --- Session idle timeout (ISO 27001 / PCI-DSS compliant) ---
    const IDLE_LIMIT_MS = 15 * 60 * 1000;   // 15 minutes
    const WARNING_AT_MS = 13 * 60 * 1000;    // show warning at 13 minutes
    const CHECK_INTERVAL_MS = 30 * 1000;     // poll every 30 seconds

    let lastActivity = Date.now();
    let warningVisible = false;
    let countdownTimer: ReturnType<typeof setInterval> | null = null;

    const resetActivity = () => { lastActivity = Date.now(); };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    activityEvents.forEach((evt) => document.addEventListener(evt, resetActivity, { passive: true }));

    const triggerLogout = () => {
      // Remove token — the existing logout monitor above will detect this and redirect
      localStorage.removeItem('jwtToken');
    };

    const removeWarningModal = () => {
      const el = document.getElementById('session-timeout-overlay');
      if (el) el.remove();
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
      warningVisible = false;
    };

    const showWarningModal = () => {
      if (warningVisible) return;
      warningVisible = true;

      let remaining = IDLE_LIMIT_MS - WARNING_AT_MS; // 2 minutes in ms

      const overlay = document.createElement('div');
      overlay.id = 'session-timeout-overlay';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Session expiring warning');
      overlay.innerHTML = `
        <div style="position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
          <div style="background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.15);padding:32px 36px;text-align:center;max-width:380px;width:90%;">
            <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#32324d;">Session Expiring</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#666687;" aria-live="polite" id="session-timeout-countdown">Your session will expire in 2:00</p>
            <div style="display:flex;gap:12px;justify-content:center;">
              <button id="session-timeout-continue" style="padding:10px 20px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:#cb6441;color:#fff;">Continue Session</button>
              <button id="session-timeout-signout" style="padding:10px 20px;border:1px solid #dcdce4;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:#fff;color:#32324d;">Sign Out</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const countdownEl = document.getElementById('session-timeout-countdown');

      countdownTimer = setInterval(() => {
        remaining -= 1000;
        if (remaining <= 0) {
          removeWarningModal();
          triggerLogout();
          return;
        }
        const min = Math.floor(remaining / 60000);
        const sec = Math.floor((remaining % 60000) / 1000);
        if (countdownEl) {
          countdownEl.textContent = `Your session will expire in ${min}:${sec.toString().padStart(2, '0')}`;
        }
      }, 1000);

      document.getElementById('session-timeout-continue')?.addEventListener('click', () => {
        removeWarningModal();
        lastActivity = Date.now();
        // Refresh the access token
        fetch('/admin/renew-token', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('jwtToken')}` } }).catch(() => {});
      });

      document.getElementById('session-timeout-signout')?.addEventListener('click', () => {
        removeWarningModal();
        triggerLogout();
      });
    };

    // Check idle status every 30 seconds
    const idleChecker = setInterval(() => {
      // If user has logged out in the meantime, stop checking
      if (!localStorage.getItem('jwtToken')) {
        clearInterval(idleChecker);
        removeWarningModal();
        return;
      }
      const idle = Date.now() - lastActivity;
      if (idle >= IDLE_LIMIT_MS) {
        clearInterval(idleChecker);
        removeWarningModal();
        triggerLogout();
      } else if (idle >= WARNING_AT_MS) {
        showWarningModal();
      }
    }, CHECK_INTERVAL_MS);
  },
};
