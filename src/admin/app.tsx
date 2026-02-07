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
        'app.components.LeftMenu.navbrand.title': 'Content Metric',
        'app.components.LeftMenu.navbrand.workplace': 'Dashboard',
        'Settings.application.strapiVersion': 'Version',
        'Settings.application.ee.admin-seats.count': '{count} seats available',
      },
    },
  },
  bootstrap(app: StrapiApp) {
    // Custom bootstrap logic
  },
};
