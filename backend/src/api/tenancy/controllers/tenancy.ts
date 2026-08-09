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
import { recordAudit } from '../../../utils/audit-log';

const UID = 'api::tenancy.tenancy';
const PROPERTY_UID = 'api::property-space.property-space';
const USER_MODEL_UID = 'plugin::users-permissions.user';
const ROLE_MODEL_UID = 'plugin::users-permissions.role';

// Staff list tenancies so they can record meter readings and manage
// contracts; updates and creation stay staff-only.
const canReadAll = (user: { id: number }) => isStaff(user);

// Business details are captured when a tenancy is created (a vacant space has
// no business yet). They are stored on the linked property space, so every
// display that reads businessName/productsServices/operatingDetails keeps
// working unchanged.
const BUSINESS_FIELDS = ['businessName', 'productsServices', 'operatingDetails'] as const;

function extractBusinessFields(data: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const key of BUSINESS_FIELDS) {
    if (key in data) {
      fields[key] = typeof data[key] === 'string' && data[key] ? data[key].trim() : undefined;
      delete data[key];
    }
  }
  return fields;
}

// Space photos are uploaded by the tenant themselves and stored on the linked
// property space, following the same pattern as the business details.
const PHOTO_FIELD = 'photos';

function extractPhotos(data: Record<string, unknown>): number[] | undefined {
  if (!(PHOTO_FIELD in data)) return undefined;
  const value = data[PHOTO_FIELD];
  delete data[PHOTO_FIELD];
  if (!Array.isArray(value)) return undefined;
  return value.map((id) => Number(id)).filter((id) => Number.isInteger(id));
}

function businessPatch(fields: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) patch[key] = value;
  }
  return patch;
}

async function propertyIdOf(
  value: unknown
): Promise<string | number | null | undefined> {
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'object' && value != null) {
    const docId = (value as { documentId?: unknown }).documentId;
    if (typeof docId === 'string' || typeof docId === 'number') return docId;
  }
  return undefined;
}

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

    // Staff can update any tenancy detail. Tenants may only replace the space
    // photos of their own tenancy; the photos are stored on the linked
    // property space so the campus map keeps showing them unchanged.
    async update(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      const staff = isStaff(user);
      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      const businessFields = extractBusinessFields(data);
      const photos = extractPhotos(data);

      if (!staff) {
        if (Object.keys(data).length > 0) {
          return ctx.forbidden('You can only update photos on your own tenancy');
        }
        const current = (await service().findOne(ctx.params.id, {
          fields: ['id', 'documentId'],
          populate: { user: { fields: ['id'] } },
        })) as { user?: { id?: number } | number | null } | null;
        if (!current) {
          return ctx.notFound();
        }
        const ownerId =
          typeof current.user === 'object' && current.user != null ? current.user.id : (current.user as number | undefined);
        if (ownerId !== user.id) {
          return ctx.forbidden('You can only update your own tenancy');
        }
      }

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

      // Write business details and space photos to the linked property space.
      const patch = businessPatch(businessFields);
      if (photos !== undefined) {
        patch.photos = photos;
      }
      if (Object.keys(patch).length > 0) {
        let propertyId = await propertyIdOf(sanitizedData.propertySpace);
        if (propertyId == null) {
          const current = (await service().findOne(ctx.params.id, {
            populate: { propertySpace: true },
          })) as { propertySpace?: unknown } | null;
          propertyId = await propertyIdOf(current?.propertySpace);
        }
        if (propertyId != null) {
          try {
            await strapi
              .documents(PROPERTY_UID)
              .update({ documentId: String(propertyId), data: patch });
          } catch {
            // The property may have been removed; leave it as-is.
          }
        }
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    // Staff only. Creating a tenancy marks the assigned space as Occupied and
    // promotes an assigned aspiring-tenant account to current-tenant.
    async create(ctx) {
      const user = ctx.state.user as { id: number; username?: string } | undefined;
      if (!user || !isStaff(user)) {
        return ctx.forbidden();
      }

      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      const businessFields = extractBusinessFields(data);
      const photos = extractPhotos(data);

      const ctrl = base(this);
      await ctrl.validateInput(data, ctx);
      const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

      const entity = await service().create({ data: sanitizedData, populate: { propertySpace: true, user: true } });
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
            .update({
              documentId: String(propertyId),
              data: {
                space_status: 'Occupied',
                ...businessPatch(businessFields),
                ...(photos !== undefined ? { photos } : {}),
              },
            });
        } catch {
          // The property may have been removed; leave it as-is.
        }
      }

      // Promote an aspiring-tenant account to current-tenant when it is
      // assigned to the new tenancy.
      const assignedUser = (entity as { user?: { id?: number } | number | null }).user;
      const assignedUserId =
        typeof assignedUser === 'object' && assignedUser != null ? assignedUser.id : assignedUser;
      if (typeof assignedUserId === 'number' && Number.isInteger(assignedUserId)) {
        try {
          const target = await strapi.db.query(USER_MODEL_UID).findOne({
            where: { id: assignedUserId },
            populate: { role: true },
          });
          const currentRoleType = target?.role?.type ?? target?.role?.name ?? null;
          if (currentRoleType === 'aspiring-tenant') {
            const currentTenantRole = await strapi.db.query(ROLE_MODEL_UID).findOne({
              where: { type: 'current-tenant' },
            });
            if (currentTenantRole) {
              await strapi
                .plugin('users-permissions')
                .service('user')
                .edit(assignedUserId, { role: currentTenantRole.id });

              await recordAudit(strapi, {
                action: 'role-changed',
                entityType: 'user',
                entityId: assignedUserId,
                entityLabel: target?.username ?? String(assignedUserId),
                description: `Changed ${target?.username ?? 'user'}'s role from aspiring-tenant to current-tenant (tenancy created)`,
                actor: { actorId: user.id, actorUsername: user.username ?? null, actorRole: userRole(user) },
              });
            }
          }
        } catch {
          // The user may have been removed; leave the role as-is.
        }
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },
  };
});
