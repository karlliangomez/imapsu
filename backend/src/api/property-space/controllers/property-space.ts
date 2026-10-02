/**
 * property-space controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::property-space.property-space',
  ({ strapi }) => {
    // Student accounts only see occupied spaces: vacant availability is not
    // shown to them anywhere, including the portfolio and campus map. Other
    // roles (staff, tenants, aspiring tenants) keep full visibility.
    const hideVacantFromStudents = (ctx: {
      state?: { user?: { role?: { type?: string } | null } | null };
      query?: Record<string, unknown>;
    }) => {
      if (ctx.state?.user?.role?.type === 'student') {
        const existing = (ctx.query?.filters as object | undefined) ?? {};
        ctx.query = { ...ctx.query, filters: { ...existing, space_status: { $eq: 'Occupied' } } };
      }
    };

    return {
      async find(ctx: any) {
        hideVacantFromStudents(ctx);
        return super.find(ctx);
      },

      async findProperties(ctx: any) {
        hideVacantFromStudents(ctx);
        return super.find(ctx);
      },

      /**
       * Tenant names for the feedback flow. The content API strips the
       * `tenancies` relation for non-staff roles (students have no tenancy
       * permissions), so this endpoint reads the active tenancy directly and
       * exposes only the tenant display name — never the full tenancy record.
       */
      async findActiveTenants(ctx) {
        const authUser = ctx.state.user;
        if (!authUser) {
          return ctx.unauthorized();
        }

        const rows = await strapi.db.query('api::property-space.property-space').findMany({
          select: ['id', 'documentId'],
          populate: {
            tenancies: {
              where: { status: 'Active' },
              populate: { user: { select: ['username', 'email'] } },
            },
          },
        });

        ctx.body = {
          data: rows.map((property: { documentId?: string; tenancies?: { status?: string; user?: { username?: string; email?: string } | null }[] | null }) => {
            const active = (property.tenancies ?? []).find((tenancy) => tenancy.status === 'Active');
            const tenantName = active?.user ? active.user.username || active.user.email || null : null;
            return {
              propertyDocumentId: property.documentId ?? null,
              tenantName,
            };
          }),
        };
      },
    };
  }
);