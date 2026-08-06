/**
 * meter-reading controller
 *
 * Meter readings are recorded by Authorized Field Personnel against a tenancy.
 * Field personnel can list/read their own readings and submit new ones; the
 * `recordedBy` relation is always server-assigned. Staff (OAS / admin) see
 * every reading and may correct or remove them.
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';
import { isStaff, userRole } from '../../../utils/access';
import { recordAudit } from '../../../utils/audit-log';

const UID = 'api::meter-reading.meter-reading';

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

      const filters =
        isStaff(user) || userRole(user) === 'field-personnel'
          ? isStaff(user)
            ? (query.filters ?? {})
            : {
                ...(query.filters ?? {}),
                recordedBy: { id: { $eq: user.id } },
              }
          : {
              ...(query.filters ?? {}),
              recordedBy: { id: { $eq: user.id } },
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
            recordedBy: { id: { $eq: user.id } },
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

      if (!isStaff(user) && userRole(user) !== 'field-personnel') {
        return ctx.forbidden('Only field personnel or staff can record meter readings');
      }

      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      delete data.recordedBy;

      if (data.electricMeterReading == null && data.waterMeterReading == null) {
        return ctx.badRequest('Provide at least one meter reading (electric or water)');
      }

      const ctrl = base(this);
      await ctrl.validateInput(data, ctx);
      const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

      const entity = await service().create({
        data: { ...sanitizedData, recordedBy: user.id },
      });

      await recordAudit(strapi, {
        action: 'created',
        entityType: 'meter-reading',
        entityId: (entity as { documentId?: string }).documentId,
        entityLabel: String(data.readingDate ?? 'reading'),
        description: `${user.username ?? 'Field personnel'} recorded a meter reading`,
        actor: { actorId: user.id, actorUsername: user.username ?? null, actorRole: userRole(user) },
      });

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    async update(ctx) {
      const user = ctx.state.user as { id: number; username?: string } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      if (!isStaff(user)) {
        return ctx.forbidden('Only staff can edit meter readings');
      }

      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;

      const ctrl = base(this);
      await ctrl.validateInput(data, ctx);
      const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

      const entity = await service().update(ctx.params.id, { data: sanitizedData });
      if (!entity) {
        return ctx.notFound();
      }

      await recordAudit(strapi, {
        action: 'updated',
        entityType: 'meter-reading',
        entityId: (entity as { documentId?: string }).documentId,
        entityLabel: String((entity as { readingDate?: string }).readingDate ?? 'reading'),
        description: `${user.username ?? 'Staff'} updated a meter reading`,
        actor: { actorId: user.id, actorUsername: user.username ?? null, actorRole: userRole(user) },
      });

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    async delete(ctx) {
      const user = ctx.state.user as { id: number; username?: string } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      if (!isStaff(user)) {
        return ctx.forbidden('Only staff can delete meter readings');
      }

      const ctrl = base(this);
      const entity = await service().delete(ctx.params.id, {});
      if (!entity) {
        return ctx.notFound();
      }

      await recordAudit(strapi, {
        action: 'deleted',
        entityType: 'meter-reading',
        entityId: (entity as { documentId?: string }).documentId,
        entityLabel: String((entity as { readingDate?: string }).readingDate ?? 'reading'),
        description: `${user.username ?? 'Staff'} deleted a meter reading`,
        actor: { actorId: user.id, actorUsername: user.username ?? null, actorRole: userRole(user) },
      });

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },
  };
});
