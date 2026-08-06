/**
 * system-settings controller
 *
 * System configuration management. The singleType is persisted in the
 * database and can only be read/updated by administrators.
 */

import { factories } from '@strapi/strapi';
import { isAdmin } from '../../../utils/access';
import { auditActor, recordAudit } from '../../../utils/audit-log';

export default factories.createCoreController('api::system-settings.system-setting', ({ strapi }) => ({
  async find(ctx) {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isAdmin(user)) {
      return ctx.forbidden('Only administrators can read system settings');
    }
    return super.find(ctx);
  },

  async update(ctx) {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isAdmin(user)) {
      return ctx.forbidden('Only administrators can update system settings');
    }

    const result = await super.update(ctx);

    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const data = (body.data ?? {}) as Record<string, unknown>;
    const changed = Object.keys(data);

    await recordAudit(strapi, {
      action: 'settings-updated',
      entityType: 'system-settings',
      entityId: 'system',
      entityLabel: 'System configuration',
      description: `Updated system settings${changed.length ? ` (${changed.join(', ')})` : ''}`,
      actor: auditActor(user),
    });

    return result;
  },
}));
