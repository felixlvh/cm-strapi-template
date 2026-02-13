export default {
  routes: [
    {
      method: 'GET',
      path: '/sso/callback',
      handler: 'sso.callback',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sso/revoke-all',
      handler: 'sso.revokeAll',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/sso/config',
      handler: 'sso.config',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/sso/sign-out',
      handler: 'sso.signOut',
      config: { auth: false },
    },
  ],
};
