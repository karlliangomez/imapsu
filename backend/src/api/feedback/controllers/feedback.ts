/**
 * feedback controller
 *
 * The `author` relation is always server-assigned on create (never trusted
 * from the request body); the authenticated student becomes the author.
 *
 * Feedback is immutable: `update` and `delete` are blocked for every role
 * (students cannot alter what they submitted, and staff view feedback as a
 * read-only feed — no CRUD).
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';
import { isStaff, userRole } from '../../../utils/access';

const UID = 'api::feedback.feedback';

export default factories.createCoreController(UID, ({ strapi }) => {
  const base = (self: unknown) => self as unknown as Core.CoreAPI.Controller.Base;
  const service = () => strapi.service(UID) as unknown as Core.CoreAPI.Service.CollectionType;

  const activeTenancyPropertyIds = async (userId: number): Promise<number[]> => {
    const tenancies = await strapi.db.query('api::tenancy.tenancy').findMany({
      where: { user: { id: userId }, status: 'Active' },
      populate: { propertySpace: { select: ['id'] } },
    });
    return tenancies
      .map((tenancy: { propertySpace?: { id?: number } | null }) => tenancy.propertySpace?.id)
      .filter((id): id is number => typeof id === 'number');
  };

  return {
    async find(ctx) {
      const user = ctx.state.user as { id: number; role?: { type?: string } } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      const ctrl = base(this);
      await ctrl.validateQuery(ctx);
      const query = await ctrl.sanitizeQuery(ctx);

      const filters = userRole(user) === 'current-tenant' && !isStaff(user)
        ? {
            ...(query.filters ?? {}),
            propertySpace: { id: { $in: await activeTenancyPropertyIds(user.id) } },
          }
        : (query.filters ?? {});

      const { results, pagination } = await service().find({ ...query, filters });

      const sanitized = await ctrl.sanitizeOutput(results, ctx);
      return ctrl.transformResponse(sanitized, { pagination });
    },

    async findOne(ctx) {
      const user = ctx.state.user as { id: number; role?: { type?: string } } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      const ctrl = base(this);
      await ctrl.validateQuery(ctx);
      const query = await ctrl.sanitizeQuery(ctx);

      const filters = userRole(user) === 'current-tenant' && !isStaff(user)
        ? {
            ...(query.filters ?? {}),
            propertySpace: { id: { $in: await activeTenancyPropertyIds(user.id) } },
          }
        : (query.filters ?? {});

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
      delete data.author;

      const ctrl = base(this);
      await ctrl.validateInput(data, ctx);
      const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

      const entity = await service().create({
        data: { ...sanitizedData, author: user.id },
      });

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    async update(ctx) {
      return ctx.forbidden('Feedback cannot be edited.');
    },

    async delete(ctx) {
      return ctx.forbidden('Feedback cannot be deleted.');
    },
  };
});
