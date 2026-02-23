export default (config, { strapi }) => {
  const blocked: string[] = [];
  if (process.env.CM_HIDE_MARKETPLACE === 'true') blocked.push('/admin/marketplace');
  if (process.env.CM_HIDE_API_TOKENS === 'true') blocked.push('/admin/api-tokens');
  if (process.env.CM_HIDE_WEBHOOKS === 'true') blocked.push('/admin/webhooks');
  if (process.env.CM_HIDE_TRANSFER_TOKENS === 'true') blocked.push('/admin/transfer-tokens');
  if (process.env.CM_HIDE_USERS_PERMISSIONS === 'true') blocked.push('/admin/users-permissions');
  if (process.env.CM_HIDE_MEDIA_LIBRARY === 'true') blocked.push('/admin/upload/settings');
  if (process.env.CM_HIDE_OVERVIEW === 'true') blocked.push('/admin/information');
  if (process.env.CM_HIDE_AUDIT_LOGS === 'true') blocked.push('/admin/audit-logs');
  if (process.env.CM_HIDE_RELEASES === 'true') blocked.push('/admin/content-releases');
  if (process.env.CM_HIDE_PLUGINS === 'true') blocked.push('/admin/plugins');
  if (process.env.CM_HIDE_REVIEW_WORKFLOWS === 'true') blocked.push('/admin/review-workflows');
  if (process.env.CM_HIDE_SSO === 'true') blocked.push('/admin/providers');
  if (process.env.CM_HIDE_ROLES === 'true') blocked.push('/admin/roles');
  if (process.env.CM_HIDE_USERS === 'true') blocked.push('/admin/users');
  if (process.env.CM_HIDE_EMAIL_CONFIG === 'true') blocked.push('/admin/email');

  if (blocked.length > 0) {
    strapi.log.info(`[feature-gate] Blocking ${blocked.length} admin routes: ${blocked.join(', ')}`);
  }

  return async (ctx, next) => {
    if (blocked.some(prefix => ctx.path.startsWith(prefix))) {
      ctx.status = 403;
      ctx.body = { error: 'This feature is disabled by your platform administrator.' };
      return;
    }
    await next();
  };
};
