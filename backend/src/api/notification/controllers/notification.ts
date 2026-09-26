/**
 * notification controller
 *
 * Notifications are written server-side by the shared notification helper
 * (rental applications, maintenance tickets, receipt uploads, ticket
 * follow-ups and announcement publications). The REST surface is read/update
 * only. Staff (OAS) see the operational inbox: events written without a
 * recipient (applications, tickets, receipts, follow-ups). Regular users only
 * ever see the notifications addressed to them (their `recipient`), e.g.
 * application status updates and new announcements.
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';
import { isStaff } from '../../../utils/access';

const UID = 'api::notification.notification';

export default factories.createCoreController(UID, ({ strapi }) => {
  const guard = async (ctx: any) => {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    return null;
  };

  // Staff only ever see the recipient-less operational inbox (application /
  // ticket / receipt / follow-up events). Announcement publications fan out
  // into one row per audience user (their `recipient`), so scoping staff to
  // recipient-less rows keeps those per-user copies out of the OAS feed.
  const ownScope = (user: { id: number }) =>
    isStaff(user) ? { recipient: { id: { $null: true } } } : { recipient: { id: user.id } };

  return {
    async find(ctx) {
      const denied = await guard(ctx);
      if (denied) return denied;

      const user = ctx.state.user as { id: number };

      const rows = await strapi.db.query(UID).findMany({
        select: [
          'id',
          'documentId',
          'type',
          'entityType',
          'entityId',
          'entityLabel',
          'title',
          'description',
          'read',
          'actorUsername',
          'createdAt',
          'updatedAt',
        ],
        where: ownScope(user),
        orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
        limit: 40,
      });

      ctx.body = { data: rows, meta: { count: rows.length } };
    },

    async unreadCount(ctx) {
      const denied = await guard(ctx);
      if (denied) return denied;

      const user = ctx.state.user as { id: number };
      const count = await strapi.db
        .query(UID)
        .count({ where: { read: false, ...ownScope(user) } });
      ctx.body = { count };
    },

    async markRead(ctx) {
      const denied = await guard(ctx);
      if (denied) return denied;

      const user = ctx.state.user as { id: number };

      const targets = await strapi.db.query(UID).findMany({
        where: { documentId: ctx.params.id, ...ownScope(user) },
        select: ['id'],
      });
      const ids = targets.map((target: { id: number }) => target.id);
      if (ids.length) {
        await strapi.db
          .query(UID)
          .updateMany({ where: { id: { $in: ids } }, data: { read: true } });
      }
      ctx.body = { ok: true };
    },

    async markAllRead(ctx) {
      const denied = await guard(ctx);
      if (denied) return denied;

      const user = ctx.state.user as { id: number };

      const targets = await strapi.db.query(UID).findMany({
        where: { read: false, ...ownScope(user) },
        select: ['id'],
      });
      const ids = targets.map((target: { id: number }) => target.id);
      let count = 0;
      if (ids.length) {
        const result = await strapi.db
          .query(UID)
          .updateMany({ where: { id: { $in: ids } }, data: { read: true } });
        count = result.count;
      }
      ctx.body = { ok: true, count };
    },
  };
});
