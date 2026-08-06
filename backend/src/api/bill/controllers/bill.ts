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
import { recordNotification } from '../../../utils/notifications';
import { extractOrNumberFromFile } from '../../../utils/or-number';
import { recordStatusChange } from '../../../utils/status-history';

const UID = 'api::bill.bill';

// Returns the "current" meter value of the most recent bill that recorded one,
// so a newly issued bill can use it as its "previous" value. Falls back to the
// tenancy's monthly rent-derived amount only when no prior reading exists.
async function lastBillMeter(
  strapi: any,
  tenancyRef: unknown,
  field: 'electricMeterCurrent' | 'waterMeterCurrent'
): Promise<number | null> {
  const docId =
    typeof tenancyRef === 'string'
      ? tenancyRef
      : tenancyRef && typeof tenancyRef === 'object'
        ? (tenancyRef as { documentId?: string }).documentId
        : undefined;
  if (!docId) return null;

  try {
    const row = (await strapi.db.query(UID).findOne({
      where: { tenancy: { documentId: docId }, [field]: { $notNull: true } },
      orderBy: { createdAt: 'desc' },
      select: [field],
    })) as { [key: string]: number | null } | null;
    const value = row?.[field];
    return value == null ? null : Number(value);
  } catch {
    return null;
  }
}

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

  const withExtractedOrNumber = async (input: Record<string, unknown>) => {
    const receipt = input.receipt;
    if (receipt == null || input.orNumber != null) return input;
    const fileId =
      typeof receipt === 'object' && receipt !== null && 'id' in receipt
        ? (receipt as { id: number | string }).id
        : (receipt as number | string);
    const orNumber = await extractOrNumberFromFile(strapi, fileId);
    return orNumber ? { ...input, orNumber } : input;
  };

  return {
    /**
     * Staff issue bills. When meter readings were recorded by field personnel
     * for the tenancy, the latest readings are pre-filled as the current
     * meter values so utility consumption is computed from them.
     */
    async create(ctx) {
      const user = ctx.state.user as { id: number } | undefined;
      if (!user) {
        return ctx.unauthorized();
      }

      if (!isStaff(user)) {
        return ctx.forbidden('Only staff can issue bills');
      }

      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;

      // When meter values are left blank, pre-fill them from the readings
      // recorded by field personnel so the bill is actually derived from the
      // meter reading history instead of manual re-entry.
      if (data.electricMeterCurrent == null || data.waterMeterCurrent == null) {
        const reading = await strapi
          .service('api::meter-reading.meter-reading')
          ?.latestForTenancy?.(data.tenancy);
        if (reading) {
          if (data.electricMeterCurrent == null && reading.electricMeterReading != null) {
            data.electricMeterCurrent = reading.electricMeterReading;
          }
          if (data.waterMeterCurrent == null && reading.waterMeterReading != null) {
            data.waterMeterCurrent = reading.waterMeterReading;
          }
          // Previous = the reading before the latest one (consumption is the
          // difference between two recorded readings).
          if (data.electricMeterPrevious == null && reading.previousElectricMeterReading != null) {
            data.electricMeterPrevious = reading.previousElectricMeterReading;
          }
          if (data.waterMeterPrevious == null && reading.previousWaterMeterReading != null) {
            data.waterMeterPrevious = reading.previousWaterMeterReading;
          }
        }
      }

      // No second reading on record yet: fall back to the previous bill's
      // current values so usage still accumulates across periods.
      if (data.electricMeterPrevious == null && data.electricMeterCurrent != null) {
        data.electricMeterPrevious = await lastBillMeter(strapi, data.tenancy, 'electricMeterCurrent');
      }
      if (data.waterMeterPrevious == null && data.waterMeterCurrent != null) {
        data.waterMeterPrevious = await lastBillMeter(strapi, data.tenancy, 'waterMeterCurrent');
      }

      const ctrl = base(this);
      await ctrl.validateInput(data, ctx);
      const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

      const entity = await service().create({ data: sanitizedData });
      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

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
        const withOr = await withExtractedOrNumber(data);
        const sanitizedData = (await ctrl.sanitizeInput(withOr, ctx)) as Record<string, unknown>;

        // Verified = OAS confirmed the payment against the uploaded receipt.
        // Sync paidAt accordingly when the verification status changes.
        if (sanitizedData.status === 'Verified' && sanitizedData.paidAt == null) {
          const current = await service().findOne(ctx.params.id, { fields: ['status', 'paidAt'] });
          if (!current || current.status !== 'Verified' || !current.paidAt) {
            sanitizedData.paidAt = new Date().toISOString();
          }
        } else if (sanitizedData.status && sanitizedData.status !== 'Verified') {
          sanitizedData.paidAt = null;
        }

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
            entityType: 'bill',
            entityId: previous.documentId ?? ctx.params.id,
            fromStatus: previous.status,
            toStatus: sanitizedData.status as string,
            changedBy: user.id,
          });
        }

        const sanitized = await ctrl.sanitizeOutput(entity, ctx);
        return ctrl.transformResponse(sanitized);
      }

      // Tenants may only upload a payment receipt (and set the OR number) on
      // one of their own bills. Uploading a receipt stages it for verification
      // by the OAS; the bill is never marked paid by the tenant.
      const existing = await service().findOne(ctx.params.id, {
        populate: { receipt: true },
        filters: { tenancy: { user: { id: { $eq: user.id } } } },
      });
      if (!existing) {
        return ctx.notFound();
      }

      if (existing.status === 'Verified') {
        return ctx.forbidden('This bill is already verified; contact the Office of Auxiliary Services to make changes.');
      }

      if (!('receipt' in data) && !('orNumber' in data)) {
        return ctx.badRequest('Tenants can only update the payment receipt');
      }

      const updateData: Record<string, unknown> = {};
      if ('receipt' in data) updateData.receipt = data.receipt;
      if ('orNumber' in data) updateData.orNumber = data.orNumber;

      const withOr = await withExtractedOrNumber(updateData);

      const ctrl = base(this);
      const sanitizedData = (await ctrl.sanitizeInput(withOr, ctx)) as Record<string, unknown>;

      // A receipt upload or OR-number entry moves the bill to For Verification
      // (advance billing notice), ahead of the OAS verifying the receipt.
      const submittedOr = data.orNumber != null ? String(data.orNumber).trim() : '';
      const hasReceipt = data.receipt != null;
      if (hasReceipt || submittedOr) {
        sanitizedData.status = 'For Verification';
      }

      // Removing a staged receipt resets the OR number extracted from it and
      // returns the bill to Unpaid.
      if (data.receipt == null && data.orNumber == null) {
        sanitizedData.orNumber = null;
        sanitizedData.status = 'Unpaid';
      }

      const previousReceiptId =
        existing.receipt == null
          ? null
          : typeof existing.receipt === 'object' && 'id' in existing.receipt
            ? (existing.receipt as { id: number }).id
            : (existing.receipt as number);

      const entity = await service().update(existing.documentId, { data: sanitizedData });
      if (!entity) {
        return ctx.notFound();
      }

      if (sanitizedData.status !== undefined && sanitizedData.status !== existing.status) {
        await recordStatusChange(strapi, {
          entityType: 'bill',
          entityId: existing.documentId,
          fromStatus: existing.status,
          toStatus: sanitizedData.status as string,
          changedBy: user.id,
        });
      }

      // Surface receipt uploads / OR-number submissions to the OAS. Removing a
      // staged receipt (data.receipt == null) produces no notification.
      const receiptUploaded =
        data.receipt != null || (data.orNumber != null && String(data.orNumber).trim() !== '');
      if (receiptUploaded) {
        const username = (user as { username?: string }).username ?? 'Tenant';
        const or = sanitizedData.orNumber ? ` (OR ${sanitizedData.orNumber})` : '';
        await recordNotification(strapi, {
          type: 'receipt',
          entityType: 'bill',
          entityId: existing.documentId,
          entityLabel: existing.period ?? 'bill',
          title: 'Payment receipt uploaded',
          description: `${username} uploaded a receipt for ${existing.period ?? 'a bill'}${or}.`,
          actorUsername: username,
        });
      }

      // Removing the receipt also deletes the uploaded file (best effort; a file
      // cleanup failure must never fail the billing update).
      if (data.receipt == null && previousReceiptId != null) {
        try {
          const uploadService = strapi.plugin('upload')?.service?.('upload');
          const fileRow = await strapi.db
            .query('plugin::upload.file')
            .findOne({ where: { id: previousReceiptId } });
          if (uploadService?.remove && fileRow) {
            await uploadService.remove(fileRow);
          }
        } catch (err) {
          strapi.log.warn(`Could not remove uploaded receipt file ${previousReceiptId}: ${(err as Error)?.message}`);
        }
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },
  };
});
