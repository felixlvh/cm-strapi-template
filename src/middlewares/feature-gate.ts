export default (config, { strapi }) => {
  // Exact-match routes: block only the specific page, not sub-paths
  const blockedExact: string[] = [];
  // Prefix-match routes: block the path and all sub-paths
  const blockedPrefix: string[] = [];

  if (process.env.CM_HIDE_MARKETPLACE === 'true') blockedPrefix.push('/admin/marketplace');
  if (process.env.CM_HIDE_API_TOKENS === 'true') blockedPrefix.push('/admin/api-tokens');
  if (process.env.CM_HIDE_WEBHOOKS === 'true') blockedPrefix.push('/admin/webhooks');
  if (process.env.CM_HIDE_TRANSFER_TOKENS === 'true') blockedPrefix.push('/admin/transfer-tokens');
  if (process.env.CM_HIDE_USERS_PERMISSIONS === 'true') blockedPrefix.push('/admin/users-permissions');
  if (process.env.CM_HIDE_MEDIA_LIBRARY === 'true') blockedPrefix.push('/admin/upload/settings');
  if (process.env.CM_HIDE_OVERVIEW === 'true') blockedExact.push('/admin/information');
  if (process.env.CM_HIDE_AUDIT_LOGS === 'true') blockedPrefix.push('/admin/audit-logs');
  if (process.env.CM_HIDE_RELEASES === 'true') blockedPrefix.push('/admin/content-releases');
  // /admin/plugins exact — don't block /admin/plugins/content-type-builder etc.
  if (process.env.CM_HIDE_PLUGINS === 'true') blockedExact.push('/admin/plugins');
  if (process.env.CM_HIDE_REVIEW_WORKFLOWS === 'true') blockedPrefix.push('/admin/review-workflows');
  if (process.env.CM_HIDE_SSO === 'true') blockedPrefix.push('/admin/providers');
  if (process.env.CM_HIDE_ROLES === 'true') blockedPrefix.push('/admin/roles');
  // /admin/users prefix — but /admin/users/me is allowlisted below
  if (process.env.CM_HIDE_USERS === 'true') blockedPrefix.push('/admin/users');
  if (process.env.CM_HIDE_EMAIL_CONFIG === 'true') blockedPrefix.push('/admin/email');

  const totalBlocked = blockedExact.length + blockedPrefix.length;
  if (totalBlocked > 0) {
    strapi.log.info(`[feature-gate] Blocking ${totalBlocked} admin routes: ${[...blockedExact, ...blockedPrefix].join(', ')}`);
  }

  // Allowlist: these routes must always be accessible regardless of feature gates
  const allowlist = [
    '/admin/users/me',           // Current user profile — required for admin panel to function
    '/admin/users/me/permissions', // Current user permissions — required for sidebar rendering
  ];

  return async (ctx, next) => {
    // Always allow critical endpoints
    if (allowlist.some(p => ctx.path === p || ctx.path.startsWith(p + '/'))) {
      await next();
      return;
    }
    // Exact match: block only the specific path
    if (blockedExact.some(p => ctx.path === p)) {
      ctx.status = 403;
      ctx.body = { error: 'This feature is disabled by your platform administrator.' };
      return;
    }
    // Prefix match: block path and all sub-paths
    if (blockedPrefix.some(p => ctx.path.startsWith(p))) {
      ctx.status = 403;
      ctx.body = { error: 'This feature is disabled by your platform administrator.' };
      return;
    }
    await next();
  };
};
