import crypto from 'crypto';
import type { Core } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // Auto-create admin user from CM_ADMIN_EMAIL if no admin users exist yet
    const adminEmail = process.env.CM_ADMIN_EMAIL;
    if (!adminEmail) return;

    try {
      // Check if any admin users already exist
      const existingUsers = await strapi.query('admin::user').findMany({ limit: 1 });
      if (existingUsers && existingUsers.length > 0) return;

      // Find the Super Admin role
      const roles = await strapi.query('admin::role').findMany();
      const superAdminRole = roles.find(
        (role: any) => role.code === 'strapi-super-admin'
      );
      if (!superAdminRole) {
        strapi.log.warn('SSO bootstrap: Super Admin role not found');
        return;
      }

      // Create admin user with a random password (login is only via SSO)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await strapi.service('admin::auth').hashPassword(randomPassword);
      await strapi.query('admin::user').create({
        data: {
          email: adminEmail,
          firstname: process.env.CM_ADMIN_FIRST_NAME || 'Admin',
          lastname: process.env.CM_ADMIN_LAST_NAME || '',
          password: hashedPassword,
          isActive: true,
          roles: [superAdminRole.id],
        },
      });

      strapi.log.info(`SSO bootstrap: Created admin user for ${adminEmail}`);
    } catch (error) {
      strapi.log.error('SSO bootstrap: Failed to create admin user');
      strapi.log.error(error);
    }
  },
};
