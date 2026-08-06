/**
 * announcement lifecycles
 *
 * When an announcement becomes published it lands in the inbox of every user
 * in its audience (Students / Tenants / Everyone), so students and tenants
 * actually get notified of new announcements instead of only seeing them on
 * the announcements page. Staff never receive these rows (the OAS inbox is
 * fed by the tenant-facing event notifications). Best-effort: a failure here
 * must never block the publish itself.
 *
 * This Strapi build has no `afterPublish` hook, so publish is detected
 * through afterCreate / afterUpdate: any persisted row whose `publishedAt`
 * is set is a published announcement. Re-publishing or editing a published
 * announcement cannot create duplicates because rows are de-duplicated on
 * the announcement documentId.
 */

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

async function notifyAudience(announcement: any) {
  if (!isPublished(announcement) || !announcement.documentId) return;

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

export default {
  async afterCreate(event: any) {
    await notifyAudience(event.result);
  },

  async afterUpdate(event: any) {
    const { result } = event;
    if (Array.isArray(result)) return;
    await notifyAudience(result);
  },
};
