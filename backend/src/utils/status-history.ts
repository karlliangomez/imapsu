/**
 * Shared status-change audit helper.
 *
 * Entity controllers call this whenever an entity's `status` attribute is
 * about to change so the audit log records who changed it and when.
 */

import type { Core } from '@strapi/strapi';

const UID = 'api::status-history.status-history';

export async function recordStatusChange(
  strapi: Core.Strapi,
  input: {
    entityType: 'rental-application' | 'maintenance-ticket' | 'bill' | 'tenancy';
    entityId: string | number;
    fromStatus?: string | null;
    toStatus?: string | null;
    changedBy?: number | null;
  }
) {
  if (!input.entityId || input.toStatus == null) {
    return;
  }

  await strapi.db.query(UID).create({
    data: {
      entityType: input.entityType,
      entityId: String(input.entityId),
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus,
      changedBy: input.changedBy ?? null,
      changedAt: new Date().toISOString(),
    },
  });
}
