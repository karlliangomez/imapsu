/**
 * audit-log controller
 *
 * Audit entries are written server-side by the shared audit helper. The REST
 * surface is read-only and restricted to administrators: audit records can be
 * reviewed but never edited or deleted through ordinary user functions.
 */

import { factories } from '@strapi/strapi';
import { isAdmin } from '../../../utils/access';

export default factories.createCoreController('api::audit-log.audit-log', ({ strapi }) => ({
  async find(ctx) {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isAdmin(user)) {
      return ctx.forbidden('Only administrators can read audit logs');
    }
    return super.find(ctx);
  },

  async findOne(ctx) {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isAdmin(user)) {
      return ctx.forbidden('Only administrators can read audit logs');
    }
    return super.findOne(ctx);
  },
}));
