/**
 * tenancy controller
 *
 * Tenants can only list/read their own tenancies; the `user` relation is
 * always server-assigned by an administrator. Staff (admin / OAS) can see
 * every tenancy. Creation, updates and deletions are managed by staff only.
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';
import { isStaff, userRole } from '../../../utils/access';
import { recordStatusChange } from '../../../utils/status-history';

const UID = 'api::tenancy.tenancy';
const PROPERTY_UID = 'api::property-space.property-space';

// Field personnel must list tenancies (read-only) so they can record meter
// readings against the correct tenancy; updates and creation stay staff-only.
const canReadAll = (user: { id: number }) => isStaff(user) || userRole(user) === 'field-personnel';

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

      const filters = canReadAll(user)
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

      const filters = canReadAll(user)
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

    // Staff only. Updates record status changes in the audit log.
    async update(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user || !isStaff(user)) {
        return ctx.forbidden('Only staff can update tenancies');
      }

      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;

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

      if (previous && sanitizedData.status !== undefined && sanitizedData.status !== previous.status) {
        await recordStatusChange(strapi, {
          entityType: 'tenancy',
          entityId: previous.documentId ?? ctx.params.id,
          fromStatus: previous.status,
          toStatus: sanitizedData.status as string,
          changedBy: user.id,
        });
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    // Staff only. Creating a tenancy marks the assigned space as Occupied.
    async create(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user || !isStaff(user)) {
        return ctx.forbidden();
      }

      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;

      const ctrl = base(this);
      await ctrl.validateInput(data, ctx);
      const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

      const entity = await service().create({ data: sanitizedData, populate: { propertySpace: true } });
      if (!entity) {
        return ctx.badRequest('Could not create the tenancy');
      }

      const property = (entity as { propertySpace?: { documentId?: string } | string | number | null }).propertySpace;
      const propertyId =
        typeof property === 'object' && property != null
          ? property.documentId
          : property;
      if (propertyId != null) {
        try {
          await strapi
            .documents(PROPERTY_UID)
            .update({ documentId: String(propertyId), data: { space_status: 'Occupied' } });
        } catch {
          // The property may have been removed; leave it as-is.
        }
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },
  };
});
