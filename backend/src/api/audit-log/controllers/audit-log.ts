/**
 * audit-log controller
 *
 * Audit entries are written server-side by the shared audit helper and the
 * record lifecycle hooks; the REST surface is read/delete only and is
 * restricted to administrators.
 */

import { factories } from '@strapi/strapi';
import { isAdmin } from '../../../utils/access';

const UID = 'api::audit-log.audit-log';

export default factories.createCoreController(UID, ({ strapi }) => ({
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

  async delete(ctx) {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isAdmin(user)) {
      return ctx.forbidden('Only administrators can delete audit logs');
    }
    return super.delete(ctx);
  },

  async deleteAll(ctx) {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isAdmin(user)) {
      return ctx.forbidden('Only administrators can clear audit logs');
    }

    await strapi.db.query(UID).deleteMany({});
    ctx.body = { deleted: true };
  },
}));
