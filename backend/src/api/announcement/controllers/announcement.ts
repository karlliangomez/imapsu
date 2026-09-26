/**
 * announcement controller
 *
 * Announcements are audience-filtered server-side: the `audience` field
 * (Everyone / Students / Tenants) is enforced against the authenticated
 * user's role so student-only and tenant-only announcements never leak to the
 * wrong account type. Announcements are also scoped to their live window for
 * non-staff: scheduled announcements (future `publishAt`) and expired ones
 * (past `expireAt`) are hidden from students, tenants and anonymous visitors.
 * Staff (OAS) always see every announcement so scheduled and expired entries
 * remain manageable.
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';
import { isStaff } from '../../../utils/access';

const UID = 'api::announcement.announcement';

// audience values visible to each role. Staff see everything; anonymous
// visitors only see announcements meant for everyone.
const ROLE_AUDIENCES: Record<string, string[]> = {
  student: ['Everyone', 'Students'],
  'aspiring-tenant': ['Everyone', 'Tenants'],
  'current-tenant': ['Everyone', 'Tenants'],
  oas: ['Everyone', 'Students', 'Tenants'],
  admin: ['Everyone', 'Students', 'Tenants'],
};

export default factories.createCoreController(UID, ({ strapi }) => {
  const base = (self: unknown) => self as unknown as Core.CoreAPI.Controller.Base;
  const service = () => strapi.service(UID) as unknown as Core.CoreAPI.Service.CollectionType;

  const audienceOf = (user?: { role?: { type?: string } }) => {
    const audiences = user?.role?.type ? ROLE_AUDIENCES[user.role.type] : undefined;
    return audiences ?? ['Everyone'];
  };

  const scoped = (query: { filters?: Record<string, unknown> }, user?: { role?: { type?: string } }) => {
    const filters: Record<string, unknown> = {
      ...(query.filters ?? {}),
      audience: { $in: audienceOf(user) },
    };
    if (!isStaff(user)) {
      const now = new Date().toISOString();
      filters.$and = [
        { $or: [{ publishAt: { $null: true } }, { publishAt: { $lte: now } }] },
        { $or: [{ expireAt: { $null: true } }, { expireAt: { $gte: now } }] },
      ];
    }
    return filters;
  };

  return {
    async find(ctx) {
      const ctrl = base(this);
      await ctrl.validateQuery(ctx);
      const query = await ctrl.sanitizeQuery(ctx);

      const filters = scoped(query, ctx.state.user as { role?: { type?: string } } | undefined);

      const { results, pagination } = await service().find({ ...query, filters });

      const sanitized = await ctrl.sanitizeOutput(results, ctx);
      return ctrl.transformResponse(sanitized, { pagination });
    },

    async findOne(ctx) {
      const ctrl = base(this);
      await ctrl.validateQuery(ctx);
      const query = await ctrl.sanitizeQuery(ctx);

      const filters = scoped(query, ctx.state.user as { role?: { type?: string } } | undefined);

      const entity = await service().findOne(ctx.params.id, { ...query, filters });
      if (!entity) {
        return ctx.notFound();
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },
  };
});
