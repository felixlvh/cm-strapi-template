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

    // Keep title updated when Strapi changes it
    const observer = new MutationObserver(() => {
      if (document.title.includes('Strapi')) {
        document.title = document.title.replace(/Strapi Admin/g, 'Content Metric').replace(/\| Strapi/g, '| Content Metric');
      }
    });
    const titleEl = document.querySelector('title');
    if (titleEl) {
      observer.observe(titleEl, { childList: true });
    }

    // Inject favicon if not present
    if (!document.querySelector('link[rel="icon"]')) {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.href = '/admin/favicon.png';
      document.head.appendChild(link);
    }
  },
};
