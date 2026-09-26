/**
 * announcement lifecycles
 *
 * When an announcement actually goes live it lands in the inbox of every user
 * in its audience (Students / Tenants / Everyone), so students and tenants
 * get notified of new announcements instead of only seeing them on the
 * announcements page. Staff never receive these rows (the OAS inbox is fed by
 * the tenant-facing event notifications). Best-effort: a failure here must
 * never block the publish itself.
 *
 * This Strapi build has no `afterPublish` hook, so going live is detected
 * through afterCreate / afterUpdate: any persisted row whose `publishedAt`
 * is set and whose publish window is open is a live announcement. Scheduled
 * announcements (future `publishAt`) stay silent; a minute cron in
 * src/index.ts notifies them once their publish date arrives. Re-publishing,
 * editing, or the cron sweep cannot create duplicates because rows are
 * de-duplicated on the announcement documentId.
 */

import { notifyAudience } from '../../../../utils/announcement-notifications';

export default {
  async afterCreate(event: any) {
    await notifyAudience(strapi, event.result);
  },

  async afterUpdate(event: any) {
    const { result } = event;
    if (Array.isArray(result)) return;
    await notifyAudience(strapi, result);
  },
};