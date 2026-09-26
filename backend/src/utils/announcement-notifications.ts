/**
 * Shared announcement notification logic.
 *
 * Announcement publication fans out one notification per audience user
 * (students / tenants). Notifications are created only while the
 * announcement is actually live: scheduled ones (`publishAt` in the future)
 * remain silent until they go live, and expired ones (`expireAt` passed)
 * notify nobody. Rows are de-duplicated on the announcement documentId so
 * re-edits and the periodic sweep can never create duplicates.
 */

import type { Core } from '@strapi/strapi';

// Which role types receive a given audience. Mirrors ROLE_AUDIENCES in the
// announcement controller: staff see everything, students see Everyone +
// Students, tenants (including aspiring) see Everyone + Tenants.
const AUDIENCE_ROLES: Record<string, string[]> = {
  Students: ['student'],
  Tenants: ['aspiring-tenant', 'current-tenant'],
  Everyone: ['student', 'aspiring-tenant', 'current-tenant'],
};

const NOTIFICATION_UID = 'api::notification.notification';

const isPublished = (entry: any) => !!entry?.publishedAt;

// A scheduled announcement is not live until publishAt; an expired one is
// not live after expireAt.
const isLive = (entry: any) => {
  const now = new Date();
  if (entry?.publishAt && new Date(entry.publishAt) > now) return false;
  if (entry?.expireAt && new Date(entry.expireAt) <= now) return false;
  return true;
};

export async function notifyAudience(strapi: Core.Strapi, announcement: any) {
  if (!isPublished(announcement) || !isLive(announcement) || !announcement.documentId) return;

  const audience = announcement.audience ?? 'Everyone';
  const roleTypes = AUDIENCE_ROLES[audience] ?? AUDIENCE_ROLES.Everyone;
  if (!roleTypes.length) return;

  try {
    const existing = await strapi.db.query(NOTIFICATION_UID).findOne({
      where: { type: 'announcement', entityId: announcement.documentId },
      select: ['id'],
    });
    if (existing) return;

    const users = await strapi.db.query('plugin::users-permissions.user').findMany({
      where: { role: { type: { $in: roleTypes } } },
      select: ['id'],
    });

    for (const user of users) {
      try {
        await strapi.db.query(NOTIFICATION_UID).create({
          data: {
            type: 'announcement',
            entityType: 'announcement',
            entityId: announcement.documentId,
            entityLabel: announcement.title ?? 'announcement',
            title: 'New announcement',
            description: announcement.title ?? 'A new announcement was published.',
            read: false,
            actorUsername: 'iMapSU',
            recipient: user.id,
          },
        });
      } catch {
        // best-effort per recipient
      }
    }
  } catch (err) {
    strapi.log.warn(`Could not record announcement notifications: ${(err as Error)?.message}`);
  }
}