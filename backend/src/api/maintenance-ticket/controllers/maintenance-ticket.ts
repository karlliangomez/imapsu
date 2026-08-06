/**
 * maintenance-ticket controller
 *
 * Tickets are auto-scoped to the reporter: clients can only list/read their
 * own tickets, and the `reporter` relation is always server-assigned on
 * create. Staff (admin / OAS) have full CRUD over every ticket — they can
 * create tickets on behalf of tenants, update status and details, and delete
 * tickets. Tenants can never modify or delete a ticket.
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';
import { isStaff } from '../../../utils/access';
import { recordNotification } from '../../../utils/notifications';
import { recordStatusChange } from '../../../utils/status-history';

const UID = 'api::maintenance-ticket.maintenance-ticket';

export default factories.createCoreController(UID, ({ strapi }) => {
  const base = (self: unknown) => self as unknown as Core.CoreAPI.Controller.Base;
  const service = () => strapi.service(UID) as unknown as Core.CoreAPI.Service.CollectionType;

  return {
    async find(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      const ctrl = base(this);
      await ctrl.validateQuery(ctx);
      const query = await ctrl.sanitizeQuery(ctx);

      const filters = isStaff(user)
        ? (query.filters ?? {})
        : {
            ...(query.filters ?? {}),
            reporter: { id: { $eq: user.id } },
          };

      const { results, pagination } = await service().find({ ...query, filters });

      const sanitized = await ctrl.sanitizeOutput(results, ctx);
      return ctrl.transformResponse(sanitized, { pagination });
    },

    async findOne(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      const ctrl = base(this);
      await ctrl.validateQuery(ctx);
      const query = await ctrl.sanitizeQuery(ctx);

      const filters = isStaff(user)
        ? (query.filters ?? {})
        : {
            ...(query.filters ?? {}),
            reporter: { id: { $eq: user.id } },
          };

      const entity = await service().findOne(ctx.params.id, { ...query, filters });
      if (!entity) {
        return ctx.notFound();
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    async create(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;

      if (!isStaff(user)) {
        delete data.reporter;
      }

      const ctrl = base(this);
      await ctrl.validateInput(data, ctx);
      const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

      const entity = await service().create({
        data: { ...sanitizedData, ...(isStaff(user) ? {} : { reporter: user.id }) },
      });

      if (!isStaff(user)) {
        await recordNotification(strapi, {
          type: 'ticket',
          entityType: 'maintenance-ticket',
          entityId: (entity as { documentId?: string }).documentId,
          entityLabel: sanitizedData.category as string | null,
          title: 'New maintenance ticket',
          description: `${(user as { username?: string }).username ?? 'Tenant'} reported a ${
            sanitizedData.category ?? 'maintenance'
          } issue.`,
          actorUsername: (user as { username?: string }).username ?? null,
        });
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    async update(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      if (!isStaff(user)) {
        return ctx.forbidden('Only staff can update maintenance tickets');
      }

      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;

      const ctrl = base(this);
      await ctrl.validateInput(data, ctx);
      const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

      const previous =
        sanitizedData.status !== undefined
          ? await service().findOne(ctx.params.id, { fields: ['status', 'documentId', 'completedAt'] })
          : null;

      // Track the completion date when a ticket moves to Completed, and clear
      // it again when the ticket is reopened.
      if (sanitizedData.status === 'Completed') {
        if (!previous || previous.status !== 'Completed' || !previous.completedAt) {
          sanitizedData.completedAt = new Date().toISOString();
        }
      } else if (sanitizedData.status !== undefined) {
        sanitizedData.completedAt = null;
      }

      const entity = await service().update(ctx.params.id, { data: sanitizedData });
      if (!entity) {
        return ctx.notFound();
      }

      if (previous && sanitizedData.status !== undefined && sanitizedData.status !== previous.status) {
        await recordStatusChange(strapi, {
          entityType: 'maintenance-ticket',
          entityId: previous.documentId ?? ctx.params.id,
          fromStatus: previous.status,
          toStatus: sanitizedData.status as string,
          changedBy: user.id,
        });
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    async delete(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      if (!isStaff(user)) {
        return ctx.forbidden('Only staff can delete maintenance tickets');
      }

      const ctrl = base(this);
      const entity = await service().delete(ctx.params.id, {});
      if (!entity) {
        return ctx.notFound();
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    /**
     * Tenants follow up on their own open tickets (Pending / In Progress).
     * Each follow-up is appended to the ticket's `followUps` thread and — when
     * submitted by a tenant — surfaces as a notification to the OAS. Staff can
     * follow up on any ticket too.
     */
    async followUp(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      const message = typeof data.message === 'string' ? data.message.trim() : '';
      if (!message) {
        return ctx.badRequest('Please write a follow-up message.');
      }

      const ctrl = base(this);
      const filters = isStaff(user)
        ? {}
        : { reporter: { id: { $eq: user.id } } };

      const existing = await service().findOne(ctx.params.id, {
        fields: ['documentId', 'status', 'category', 'followUps'],
        populate: { reporter: { fields: ['username'] } },
        filters,
      });
      if (!existing) {
        return ctx.notFound();
      }

      if (existing.status === 'Completed') {
        return ctx.badRequest('This ticket is already completed.');
      }

      const author = (existing.reporter as { username?: string } | null)?.username ?? 'Tenant';
      const followUps = Array.isArray(existing.followUps) ? existing.followUps : [];

      const entity = await service().update(ctx.params.id, {
        data: {
          followUps: [
            ...followUps,
            { message, author, createdAt: new Date().toISOString() },
          ],
        },
      });
      if (!entity) {
        return ctx.notFound();
      }

      if (!isStaff(user)) {
        await recordNotification(strapi, {
          type: 'follow-up',
          entityType: 'maintenance-ticket',
          entityId: (existing as { documentId?: string }).documentId ?? ctx.params.id,
          entityLabel: existing.category ?? 'maintenance',
          title: 'Maintenance follow-up',
          description: `${author} followed up: ${message}`,
          actorUsername: author,
        });
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },
  };
});
