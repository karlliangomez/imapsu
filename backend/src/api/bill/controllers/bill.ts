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
import { extractOrNumberFromFile } from '../../../utils/or-number';

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

        // Staff verify receipts; when they change the payment status, sync paidAt.
        if (sanitizedData.status === 'Paid' && sanitizedData.paidAt == null) {
          const current = await service().findOne(ctx.params.id, { fields: ['status', 'paidAt'] });
          if (!current || current.status !== 'Paid' || !current.paidAt) {
            sanitizedData.paidAt = new Date().toISOString();
          }
        } else if (sanitizedData.status === 'Unpaid') {
          sanitizedData.paidAt = null;
        }

        const entity = await service().update(ctx.params.id, { data: sanitizedData });
        if (!entity) {
          return ctx.notFound();
        }

        const sanitized = await ctrl.sanitizeOutput(entity, ctx);
        return ctrl.transformResponse(sanitized);
      }

      // Tenants may only upload a payment receipt (and set/verify the OR number)
      // against one of their own bills.
      const existing = await service().findOne(ctx.params.id, {
        populate: { receipt: true },
        filters: { tenancy: { user: { id: { $eq: user.id } } } },
      });
      if (!existing) {
        return ctx.notFound();
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

      // Attaching a receipt only stages it (OCR fills the OR number for review).
      // The payment is recorded when the tenant submits the OR number — extracted
      // or entered manually; staff verify afterwards.
      const submittedOr = data.orNumber != null ? String(data.orNumber).trim() : '';
      if (submittedOr) {
        sanitizedData.status = 'Paid';
        sanitizedData.paidAt = new Date().toISOString();
      }

      // Removing a staged receipt resets the OR number that was extracted from it.
      if (data.receipt == null && data.orNumber == null) {
        sanitizedData.orNumber = null;
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
