/**
 * renewal-intent controller
 *
 * Current tenants submit a renewal intent (with a letter of renewal intent)
 * against one of their own tenancies; the `user` and `tenancy` relations are
 * always validated and server-assigned on create. Staff (admin / OAS) can see
 * every renewal intent and manage its status; status changes are recorded in
 * the audit log.
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';
import { isStaff } from '../../../utils/access';
import { recordStatusChange } from '../../../utils/status-history';

const UID = 'api::renewal-intent.renewal-intent';

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
      const user = ctx.state.user as { id: number } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;

      if (!isStaff(user)) {
        delete data.user;

        // A tenant may only file a renewal against their own tenancy.
        const tenancyId = data.tenancy;
        if (tenancyId == null) {
          return ctx.badRequest('A tenancy is required');
        }

        const ownTenancy = await strapi.service('api::tenancy.tenancy').findOne(
          String(tenancyId),
          { filters: { user: { id: { $eq: user.id } } }, fields: ['documentId'] }
        );
        if (!ownTenancy) {
          return ctx.forbidden('The selected tenancy does not belong to you');
        }
      }

      const ctrl = base(this);
      await ctrl.validateInput(data, ctx);
      const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

      const entity = await service().create({
        data: { ...sanitizedData, ...(isStaff(user) ? {} : { user: user.id }) },
      });

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    async update(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;

      if (isStaff(user)) {
        const ctrl = base(this);
        await ctrl.validateInput(data, ctx);
        const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

        const previous =
          sanitizedData.status !== undefined
            ? await service().findOne(ctx.params.id, { fields: ['status', 'documentId'] })
            : null;

        const entity = await service().update(ctx.params.id, { data: sanitizedData });
        if (!entity) {
          return ctx.notFound();
        }

        if (
          previous &&
          sanitizedData.status !== undefined &&
          sanitizedData.status !== previous.status
        ) {
          await recordStatusChange(strapi, {
            entityType: 'renewal-intent',
            entityId: previous.documentId ?? ctx.params.id,
            fromStatus: previous.status,
            toStatus: sanitizedData.status as string,
            changedBy: user.id,
          });
        }

        const sanitized = await ctrl.sanitizeOutput(entity, ctx);
        return ctrl.transformResponse(sanitized);
      }

      // Tenants may only attach a letter of renewal to their own intent;
      // every other field is managed by staff.
      const existing = await service().findOne(ctx.params.id, {
        filters: { user: { id: { $eq: user.id } } },
      });
      if (!existing) {
        return ctx.notFound();
      }

      if (!('letterOfRenewal' in data)) {
        return ctx.badRequest('Tenants can only update the letter of renewal');
      }

      const ctrl = base(this);
      const sanitizedData = (await ctrl.sanitizeInput(
        { letterOfRenewal: data.letterOfRenewal },
        ctx
      )) as Record<string, unknown>;

      const entity = await service().update(existing.documentId, { data: sanitizedData });
      if (!entity) {
        return ctx.notFound();
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },
  };
});
