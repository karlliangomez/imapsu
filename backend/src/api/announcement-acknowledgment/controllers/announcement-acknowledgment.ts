/**
 * announcement-acknowledgment controller
 *
 * Records whether a notice has been viewed/acknowledged by a user. The `user`
 * relation is always server-assigned; a user can only acknowledge an
 * announcement once (idempotent). Staff (OAS) can list acknowledgments for an
 * announcement to see reach/acknowledgment counts.
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';
import { isStaff } from '../../../utils/access';

const UID = 'api::announcement-acknowledgment.announcement-acknowledgment';

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
            user: { id: { $eq: user.id } },
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
            user: { id: { $eq: user.id } },
          };

      const entity = await service().findOne(ctx.params.id, { ...query, filters });
      if (!entity) {
        return ctx.notFound();
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    async create(ctx) {
      const user = ctx.state.user as { id: number; username?: string } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;

      if (!data.announcement) {
        return ctx.badRequest('Please specify the announcement to acknowledge');
      }

      const ctrl = base(this);
      await ctrl.validateInput({ announcement: data.announcement }, ctx);

      const announcement = await strapi.db
        .query('api::announcement.announcement')
        .findOne({ where: { documentId: String(data.announcement) }, select: ['id', 'documentId', 'title'] });
      if (!announcement) {
        return ctx.badRequest('Announcement not found');
      }

      // Idempotent: a user can only acknowledge a notice once.
      const existing = await strapi.db.query(UID).findOne({
        where: { announcement: announcement.id, user: { id: user.id } },
      });

      if (existing) {
        const sanitized = await ctrl.sanitizeOutput(existing, ctx);
        return ctrl.transformResponse(sanitized);
      }

      const entity = await service().create({
        data: {
          announcement: announcement.id,
          user: user.id,
          acknowledgedAt: new Date().toISOString(),
        },
      });

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    async update(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      if (!isStaff(user)) {
        return ctx.forbidden('Only staff can update acknowledgments');
      }

      const ctrl = base(this);
      const entity = await service().update(ctx.params.id, {
        data: { acknowledgedAt: new Date().toISOString() },
      });
      if (!entity) {
        return ctx.notFound();
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
        return ctx.forbidden('Only staff can delete acknowledgments');
      }

      const ctrl = base(this);
      const entity = await service().delete(ctx.params.id, {});
      if (!entity) {
        return ctx.notFound();
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },
  };
});
