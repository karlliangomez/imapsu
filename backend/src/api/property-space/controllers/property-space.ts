/**
 * property-space controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::property-space.property-space',
  ({ strapi }) => ({
    async findProperties(ctx) {
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
  })
);