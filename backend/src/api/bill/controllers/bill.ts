/**
 * bill controller
 *
 * Tenants can only list/read bills that belong to their own tenancy, and may
 * only attach a payment receipt to a bill of their own. Staff (admin / OAS)
 * can see, create and edit every bill.
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';
import { isStaff } from '../../../utils/access';

const UID = 'api::bill.bill';

export default factories.createCoreController(UID, ({ strapi }) => {
  const base = (self: unknown) => self as unknown as Core.CoreAPI.Controller.Base;
  const service = () => strapi.service(UID) as unknown as Core.CoreAPI.Service.CollectionType;

  const ownBillFilter = (query: Record<string, any>, user: { id: number }) => {
    return isStaff(user)
      ? (query.filters ?? {})
      : {
          ...(query.filters ?? {}),
          tenancy: { user: { id: { $eq: user.id } } },
        };
  };

  return {
    async find(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      const ctrl = base(this);
      await ctrl.validateQuery(ctx);
      const query = await ctrl.sanitizeQuery(ctx);

      const { results, pagination } = await service().find({
        ...query,
        filters: ownBillFilter(query, user),
      });

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

      const entity = await service().findOne(ctx.params.id, {
        ...query,
        filters: ownBillFilter(query, user),
      });
      if (!entity) {
        return ctx.notFound();
      }

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

        const entity = await service().update(ctx.params.id, { data: sanitizedData });
        if (!entity) {
          return ctx.notFound();
        }

        const sanitized = await ctrl.sanitizeOutput(entity, ctx);
        return ctrl.transformResponse(sanitized);
      }

      // Tenants may only upload a payment receipt against one of their own bills.
      const existing = await service().findOne(ctx.params.id, {
        filters: { tenancy: { user: { id: { $eq: user.id } } } },
      });
      if (!existing) {
        return ctx.notFound();
      }

      if (!('receipt' in data)) {
        return ctx.badRequest('Tenants can only upload a payment receipt');
      }

      const ctrl = base(this);
      const sanitizedData = (await ctrl.sanitizeInput(
        { receipt: data.receipt },
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
