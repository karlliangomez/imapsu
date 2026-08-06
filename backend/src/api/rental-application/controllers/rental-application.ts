/**
 * rental-application controller
 *
 * Regular users (aspiring tenants) can only list/read their own applications,
 * and the `user` relation is always server-assigned on create. Staff
 * (admin / OAS) can see and modify every application. Regular users may only
 * attach a letter of intent to their own application.
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';
import { isStaff } from '../../../utils/access';
import { recordNotification, resolvePropertyLabel } from '../../../utils/notifications';
import { recordStatusChange } from '../../../utils/status-history';

const UID = 'api::rental-application.rental-application';

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
      }

      const ctrl = base(this);
      await ctrl.validateInput(data, ctx);
      const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

      const entity = await service().create({
        data: { ...sanitizedData, ...(isStaff(user) ? {} : { user: user.id }) },
      });

      if (!isStaff(user)) {
        const propertyLabel = await resolvePropertyLabel(strapi, data.propertySpace);
        await recordNotification(strapi, {
          type: 'application',
          entityType: 'rental-application',
          entityId: (entity as { documentId?: string }).documentId,
          entityLabel: propertyLabel,
          title: 'New rental application',
          description: `${
            (user as { username?: string }).username ?? 'Applicant'
          } applied to ${propertyLabel ?? 'a property'}.`,
          actorUsername: (user as { username?: string }).username ?? null,
        });
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

        const previous =
          sanitizedData.status !== undefined
            ? await service().findOne(ctx.params.id, {
                fields: ['status', 'documentId'],
                populate: {
                  user: { fields: ['id'] },
                  propertySpace: { fields: ['name'] },
                },
              })
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
            entityType: 'rental-application',
            entityId: previous.documentId ?? ctx.params.id,
            fromStatus: previous.status,
            toStatus: sanitizedData.status as string,
            changedBy: user.id,
          });

          // The applicant receives a notification whenever the OAS moves the
          // application to For Review / For Recommendation / Approved /
          // Declined / Cancelled.
          const applicant = previous.user as { id?: number } | undefined | null;
          const propertyName = (previous.propertySpace as { name?: string } | null)?.name ?? null;
          if (applicant?.id != null) {
            await recordNotification(strapi, {
              type: 'application',
              entityType: 'rental-application',
              entityId: previous.documentId ?? ctx.params.id,
              entityLabel: propertyName,
              title: 'Application status updated',
              description: `Your application${propertyName ? ` for ${propertyName}` : ''} is now ${sanitizedData.status}.`,
              actorUsername: (user as { username?: string }).username ?? 'OAS',
              recipientId: applicant.id,
            });
          }
        }

        const sanitized = await ctrl.sanitizeOutput(entity, ctx);
        return ctrl.transformResponse(sanitized);
      }

      // Regular applicants may only attach a letter of intent to their own
      // application; every other field is managed by staff.
      const existing = await service().findOne(ctx.params.id, {
        filters: { user: { id: { $eq: user.id } } },
      });
      if (!existing) {
        return ctx.notFound();
      }

      if (!('letterOfIntent' in data)) {
        return ctx.badRequest('Applicants can only update the letter of intent');
      }

      const ctrl = base(this);
      const sanitizedData = (await ctrl.sanitizeInput(
        { letterOfIntent: data.letterOfIntent },
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
