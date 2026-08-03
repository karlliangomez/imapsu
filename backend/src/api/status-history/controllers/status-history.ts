/**
 * status-history controller
 *
 * Read-only audit log of entity status changes. Recording happens inside the
 * entity controllers (`recordStatusChange`); this controller only exposes a
 * staff-only lookup endpoint filtered by entity type and entity id.
 */

import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { isStaff } from '../../../utils/access';

const { ValidationError } = errors;

const UID = 'api::status-history.status-history';

export default factories.createCoreController(UID, ({ strapi }) => ({
  async findByEntity(ctx) {
    const user = ctx.state.user as { id: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isStaff(user)) {
      return ctx.forbidden();
    }

    const entityType = String(ctx.query.entityType ?? '');
    const entityId = String(ctx.query.entityId ?? '');

    if (!entityType || !entityId) {
      throw new ValidationError('entityType and entityId are required');
    }

    const rows = await strapi.db.query(UID).findMany({
      where: { entityType, entityId },
      populate: { changedBy: true },
      orderBy: { changedAt: 'desc' },
    });

    ctx.body = rows.map((row: any) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      changedAt: row.changedAt,
      changedBy: row.changedBy
        ? { id: row.changedBy.id, username: row.changedBy.username }
        : null,
    }));
  },
}));
