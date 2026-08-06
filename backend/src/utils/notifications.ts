/**
 * Shared notification helper.
 *
 * Tenant-facing events (rental applications, maintenance tickets, receipt
 * uploads, ticket follow-ups) are surfaced to the OAS as notifications.
 * When `recipientId` is given, the notification is delivered to that user's
 * inbox instead (e.g. an application status update for the applicant, or a
 * new announcement for its audience). Recording is best-effort and must
 * never break the originating request.
 */

import type { Core } from '@strapi/strapi';
import { getSettings } from '../api/system-settings/services/system-setting';

const UID = 'api::notification.notification';

// Which notification categories are enabled is controlled from the persisted
// system settings (System configuration → Notifications).
const TYPE_TOGGLE: Record<string, string> = {
  application: 'notifyOnApplication',
  ticket: 'notifyOnTicket',
  receipt: 'notifyOnReceipt',
  'follow-up': 'notifyOnFollowUp',
};

export async function recordNotification(
  strapi: Core.Strapi,
  input: {
    type: 'application' | 'ticket' | 'receipt' | 'follow-up' | 'announcement';
    entityType?: string | null;
    entityId?: string | number | null;
    entityLabel?: string | null;
    title: string;
    description?: string | null;
    actorUsername?: string | null;
    recipientId?: number | string | null;
  }
) {
  // Best-effort: if settings cannot be read, default to enabled so that
  // notification recording never silently drops events.
  try {
    const settings = await getSettings(strapi);
    const toggle = TYPE_TOGGLE[input.type];
    if (toggle && settings[toggle] === false) {
      return;
    }
  } catch {
    // proceed with defaults
  }

  const entityId = input.entityId;

  try {
    await strapi.db.query(UID).create({
      data: {
        type: input.type,
        entityType: input.entityType ?? null,
        entityId: entityId != null ? String(entityId) : null,
        entityLabel: input.entityLabel ?? null,
        title: input.title,
        description: input.description ?? null,
        read: false,
        actorUsername: input.actorUsername ?? null,
        ...(input.recipientId != null ? { recipient: input.recipientId } : {}),
      },
    });
  } catch {
    // best-effort
  }
}

/**
 * Resolve a property reference (documentId string, object with `name`, or
 * `{ documentId }` object) into a short human-readable label.
 */
export async function resolvePropertyLabel(
  strapi: Core.Strapi,
  ref: unknown
): Promise<string | null> {
  if (!ref) return null;

  if (typeof ref === 'object' && ref !== null && 'name' in ref) {
    const name = String((ref as { name: unknown }).name ?? '').trim();
    if (name) return name;
  }

  const docId =
    typeof ref === 'string'
      ? ref
      : ref && typeof ref === 'object' && 'documentId' in ref
        ? String((ref as { documentId: unknown }).documentId ?? '')
        : '';

  if (!docId) return null;

  try {
    const space = await strapi.db.query('api::property-space.property-space').findOne({
      where: { documentId: docId },
      select: ['name', 'propertyCode'],
    });
    if (!space) return null;
    return [space.name, space.propertyCode].filter(Boolean).join(' ');
  } catch {
    return null;
  }
}
