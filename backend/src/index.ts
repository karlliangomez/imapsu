import type { Core } from '@strapi/strapi';
import { getSettings } from './api/system-settings/services/system-setting';
import { createBackup, pruneBackups } from './utils/backup';
import { recordAudit } from './utils/audit-log';
const PUBLIC_ROLES = [
  {
    type: 'student',
    name: 'Student',
    description: 'Registered student who can navigate the map and submit feedback about stall tenants.',
  },
  {
    type: 'aspiring-tenant',
    name: 'Aspiring Tenant',
    description: 'Applicant who can browse vacant spaces and submit rental applications.',
  },
  {
    type: 'current-tenant',
    name: 'Current Tenant',
    description: 'Tenant with an active contract; has access to property management features.',
  },
  {
    type: 'oas',
    name: 'Office of Auxiliary Services',
    description: 'Staff account that manages properties, tenancies, applications, bills, announcements and service requests.',
  },
  {
    type: 'admin',
    name: 'Administrator',
    description: 'Full control over the platform, including user accounts and roles.',
  },
];

const ROLE_UID = 'plugin::users-permissions.role';
const PERMISSION_UID = 'plugin::users-permissions.permission';

const PROPERTY_READ = [
  'api::property-space.property-space.find',
  'api::property-space.property-space.findOne',
];

const ANNOUNCEMENT_READ = [
  'api::announcement.announcement.find',
  'api::announcement.announcement.findOne',
];

// Campus map zones are public: guests can browse the 3D map and its named
// footprints without signing in.
const MAP_ZONE_READ = [
  'api::map-zone.map-zone.find',
  'api::map-zone.map-zone.findOne',
];

// Building labels (custom display names OAS assigns on the 3D map) are read
// by everyone so the map can show the assigned names; only OAS edits them.
const MAP_LABEL_READ = [
  'api::map-label.map-label.find',
  'api::map-label.map-label.findOne',
];

// Utility meter readings recorded by Authorized Field Personnel.
const METER_READING_ACTIONS = [
  'api::meter-reading.meter-reading.find',
  'api::meter-reading.meter-reading.findOne',
  'api::meter-reading.meter-reading.create',
  'api::meter-reading.meter-reading.update',
  'api::meter-reading.meter-reading.delete',
];

// Announcement acknowledgment tracking (viewed / acknowledged notices).
const ANNOUNCEMENT_ACK_ACTIONS = [
  'api::announcement-acknowledgment.announcement-acknowledgment.find',
  'api::announcement-acknowledgment.announcement-acknowledgment.findOne',
  'api::announcement-acknowledgment.announcement-acknowledgment.create',
  'api::announcement-acknowledgment.announcement-acknowledgment.update',
  'api::announcement-acknowledgment.announcement-acknowledgment.delete',
];

// Announcement audiences (students, tenants, field personnel) can acknowledge
// a notice once; the acknowledgment is always scoped to their own account.
const ANNOUNCEMENT_ACK_USER_ACTIONS = [
  'api::announcement-acknowledgment.announcement-acknowledgment.find',
  'api::announcement-acknowledgment.announcement-acknowledgment.findOne',
  'api::announcement-acknowledgment.announcement-acknowledgment.create',
];

// In-app notifications are read by every authenticated role; the controller
// scopes the rows to the caller's own inbox, so these actions never leak
// another user's notifications.
const NOTIFICATION_USER_ACTIONS = [
  'api::notification.notification.find',
  'api::notification.notification.unreadCount',
  'api::notification.notification.markRead',
  'api::notification.notification.markAllRead',
];

// Business/workflow actions owned exclusively by OAS. These are revoked from
// the administrator role at every bootstrap so the admin surface stays focused
// on user management, roles & permissions, audit logs and system monitoring.
const BUSINESS_ACTIONS = [
  'api::property-space.property-space.find',
  'api::property-space.property-space.findOne',
  'api::property-space.property-space.create',
  'api::property-space.property-space.update',
  'api::property-space.property-space.delete',
  'api::announcement.announcement.find',
  'api::announcement.announcement.findOne',
  'api::announcement.announcement.create',
  'api::announcement.announcement.update',
  'api::announcement.announcement.delete',
  'api::rental-application.rental-application.find',
  'api::rental-application.rental-application.findOne',
  'api::rental-application.rental-application.create',
  'api::rental-application.rental-application.update',
  'api::rental-application.rental-application.delete',
  'api::bill.bill.find',
  'api::bill.bill.findOne',
  'api::bill.bill.create',
  'api::bill.bill.update',
  'api::bill.bill.delete',
  'api::tenancy.tenancy.find',
  'api::tenancy.tenancy.findOne',
  'api::tenancy.tenancy.create',
  'api::tenancy.tenancy.update',
  'api::tenancy.tenancy.delete',
  'api::renewal-intent.renewal-intent.find',
  'api::renewal-intent.renewal-intent.findOne',
  'api::renewal-intent.renewal-intent.create',
  'api::renewal-intent.renewal-intent.update',
  'api::renewal-intent.renewal-intent.delete',
  'api::maintenance-ticket.maintenance-ticket.find',
  'api::maintenance-ticket.maintenance-ticket.findOne',
  'api::maintenance-ticket.maintenance-ticket.create',
  'api::maintenance-ticket.maintenance-ticket.update',
  'api::maintenance-ticket.maintenance-ticket.delete',
  'api::maintenance-ticket.maintenance-ticket.followUp',
  'api::notification.notification.find',
  'api::notification.notification.unreadCount',
  'api::notification.notification.markRead',
  'api::notification.notification.markAllRead',
  'api::feedback.feedback.find',
  'api::feedback.feedback.findOne',
  'api::feedback.feedback.create',
  'api::feedback.feedback.update',
  ...METER_READING_ACTIONS,
  ...ANNOUNCEMENT_ACK_ACTIONS,
  'api::map-zone.map-zone.find',
  'api::map-zone.map-zone.findOne',
  'api::map-zone.map-zone.create',
  'api::map-zone.map-zone.update',
  'api::map-zone.map-zone.delete',
  'api::map-label.map-label.find',
  'api::map-label.map-label.findOne',
  'api::map-label.map-label.create',
  'api::map-label.map-label.update',
  'api::map-label.map-label.delete',
];

// OAS must never manage existing users: account creation (tenancy flow) only.
// Read access (`find`/`findOne`) is required so the tenancy page can populate
// its `user` relation and list tenant accounts for assignment, so only the
// user-management actions are forbidden.
const OAS_FORBIDDEN_ACTIONS = [
  'plugin::users-permissions.user.update',
  'plugin::users-permissions.user.destroy',
];

// Actions removed from the administrator role (revoked on every bootstrap) so
// scope changes actually take effect: audit logs are append-only, so the
// ability to delete/clear them is permanently withdrawn.
const REVOKED_ADMIN_ACTIONS = [
  'api::audit-log.audit-log.delete',
];

// Content-API actions granted to each role. The authenticated role only gets
// the shared baseline (announcements + properties read); role-specific
// capabilities are granted to the custom public roles below. Properties are
// readable by everyone because the 3D campus map colors building footprints by
// vacancy status and shows the property spaces inside each building.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  public: [
    ...PROPERTY_READ,
    ...ANNOUNCEMENT_READ,
    ...MAP_ZONE_READ,
    ...MAP_LABEL_READ,
  ],
  authenticated: [
    'api::auth.auth.me',
    'api::auth.auth.updateAccount',
    ...PROPERTY_READ,
    ...ANNOUNCEMENT_READ,
    ...MAP_ZONE_READ,
    ...MAP_LABEL_READ,
  ],
  student: [
    'api::auth.auth.me',
    'api::auth.auth.updateAccount',
    ...PROPERTY_READ,
    ...ANNOUNCEMENT_READ,
    ...MAP_ZONE_READ,
    ...MAP_LABEL_READ,
    'api::feedback.feedback.find',
    'api::feedback.feedback.findOne',
    'api::feedback.feedback.create',
    // Profile photo uploads for the student's own account.
    'plugin::upload.content-api.upload',
    ...ANNOUNCEMENT_ACK_USER_ACTIONS,
    ...NOTIFICATION_USER_ACTIONS,
  ],
  'aspiring-tenant': [
    'api::auth.auth.me',
    'api::auth.auth.updateAccount',
    ...PROPERTY_READ,
    ...ANNOUNCEMENT_READ,
    ...MAP_ZONE_READ,
    ...MAP_LABEL_READ,
    ...ANNOUNCEMENT_ACK_USER_ACTIONS,
    'api::rental-application.rental-application.find',
    'api::rental-application.rental-application.findOne',
    'api::rental-application.rental-application.create',
    'api::rental-application.rental-application.update',
    'plugin::upload.content-api.upload',
    ...NOTIFICATION_USER_ACTIONS,
  ],
  'current-tenant': [
    'api::auth.auth.me',
    'api::auth.auth.updateAccount',
    ...PROPERTY_READ,
    ...ANNOUNCEMENT_READ,
    ...MAP_ZONE_READ,
    ...MAP_LABEL_READ,
    'api::maintenance-ticket.maintenance-ticket.find',
    'api::maintenance-ticket.maintenance-ticket.findOne',
    'api::maintenance-ticket.maintenance-ticket.create',
    'api::feedback.feedback.find',
    'api::feedback.feedback.findOne',
    'api::bill.bill.find',
    'api::bill.bill.findOne',
    'api::bill.bill.update',
    'api::tenancy.tenancy.find',
    'api::tenancy.tenancy.findOne',
    'api::renewal-intent.renewal-intent.find',
    'api::renewal-intent.renewal-intent.findOne',
    'api::renewal-intent.renewal-intent.create',
    'api::renewal-intent.renewal-intent.update',
    'api::maintenance-ticket.maintenance-ticket.followUp',
    'plugin::upload.content-api.upload',
    ...ANNOUNCEMENT_ACK_USER_ACTIONS,
    ...NOTIFICATION_USER_ACTIONS,
  ],
  oas: [
    'api::auth.auth.me',
    'api::auth.auth.updateAccount',
    'api::property-space.property-space.find',
    'api::property-space.property-space.findOne',
    'api::property-space.property-space.create',
    'api::property-space.property-space.update',
    'api::property-space.property-space.delete',
    'api::announcement.announcement.find',
    'api::announcement.announcement.findOne',
    'api::announcement.announcement.create',
    'api::announcement.announcement.update',
    'api::announcement.announcement.delete',
    'api::rental-application.rental-application.find',
    'api::rental-application.rental-application.findOne',
    'api::rental-application.rental-application.create',
    'api::rental-application.rental-application.update',
    'api::rental-application.rental-application.delete',
    'api::bill.bill.find',
    'api::bill.bill.findOne',
    'api::bill.bill.create',
    'api::bill.bill.update',
    'api::bill.bill.delete',
    'api::tenancy.tenancy.find',
    'api::tenancy.tenancy.findOne',
    'api::tenancy.tenancy.create',
    'api::tenancy.tenancy.update',
    'api::tenancy.tenancy.delete',
    'api::renewal-intent.renewal-intent.find',
    'api::renewal-intent.renewal-intent.findOne',
    'api::renewal-intent.renewal-intent.create',
    'api::renewal-intent.renewal-intent.update',
    'api::renewal-intent.renewal-intent.delete',
    'api::maintenance-ticket.maintenance-ticket.find',
    'api::maintenance-ticket.maintenance-ticket.findOne',
    'api::maintenance-ticket.maintenance-ticket.create',
    'api::maintenance-ticket.maintenance-ticket.update',
    'api::maintenance-ticket.maintenance-ticket.delete',
    'api::maintenance-ticket.maintenance-ticket.followUp',
    // OAS in-app notifications for tenant activity.
    'api::notification.notification.find',
    'api::notification.notification.unreadCount',
    'api::notification.notification.markRead',
    'api::notification.notification.markAllRead',
    'api::feedback.feedback.find',
    'api::feedback.feedback.findOne',
    // OAS reviews feedback: categorization and recorded action (never edits
    // the student's original submission).
    'api::feedback.feedback.update',
    // Utility meter readings (view, correct, and remove; field personnel submit).
    ...METER_READING_ACTIONS,
    // Announcement acknowledgment tracking.
    ...ANNOUNCEMENT_ACK_ACTIONS,
    // 3D campus map footprints (define + link buildings to properties).
    'api::map-zone.map-zone.find',
    'api::map-zone.map-zone.findOne',
    'api::map-zone.map-zone.create',
    'api::map-zone.map-zone.update',
    'api::map-zone.map-zone.delete',
    // Building display names on the 3D campus map (assign + edit).
    'api::map-label.map-label.find',
    'api::map-label.map-label.findOne',
    'api::map-label.map-label.create',
    'api::map-label.map-label.update',
    'api::map-label.map-label.delete',
    // Tenancy-flow account creation only: OAS can create tenant-facing
    // accounts but cannot list, edit or delete existing users. Read access to
    // the user model is required so the tenancy/bill/maintenance/feedback
    // pages can populate their `user` relations (a user may never be edited
    // or removed by OAS).
    'api::auth.auth.createUserByStaff',
    'plugin::upload.content-api.upload',
    'plugin::upload.content-api.find',
    'plugin::users-permissions.user.find',
    'plugin::users-permissions.user.findOne',
  ],
  admin: [
    'api::auth.auth.me',
    'api::auth.auth.updateAccount',
    // Profile photo uploads for the administrator's own account.
    'plugin::upload.content-api.upload',
    // User management (list, inspect, create, edit, block/unblock, delete).
    'api::auth.auth.createUserByStaff',
    'plugin::users-permissions.user.find',
    'plugin::users-permissions.user.findOne',
    'plugin::users-permissions.user.update',
    'plugin::users-permissions.user.destroy',
    // Roles & permissions management.
    'api::auth.auth.listRoles',
    'api::auth.auth.updateRolePermissions',
    // Audit logs (read-only: audit records are append-only and cannot be
    // edited or deleted through ordinary user functions).
    'api::audit-log.audit-log.find',
    'api::audit-log.audit-log.findOne',
    // System monitoring & maintenance.
    'api::system.system.health',
    // System configuration management (account policies, upload restrictions,
    // notification settings, backup schedule, system status values).
    'api::system-settings.system-setting.find',
    'api::system-settings.system-setting.update',
    // Database backup & recovery.
    'api::system.system.backup',
    'api::system.system.backupList',
    'api::system.system.restoreBackup',
    'api::system.system.deleteBackup',
  ],
};

async function ensurePermission(strapi: Core.Strapi, roleId: number, action: string) {
  const permissionModel = strapi.db.query(PERMISSION_UID);
  const existing = await permissionModel.findOne({ where: { action, role: roleId } });

  if (!existing) {
    await permissionModel.create({ data: { action, role: roleId } });
  }
}

async function ensureRolePermissions(strapi: Core.Strapi) {
  const roleModel = strapi.db.query(ROLE_UID);

  for (const [roleType, actions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await roleModel.findOne({ where: { type: roleType } });
    if (!role) {
      continue;
    }

    for (const action of actions) {
      await ensurePermission(strapi, role.id, action);
    }
  }
}

// Revoke stale or forbidden actions so role re-scoping actually takes effect
// (ensureRolePermissions only ever adds).
async function pruneForbiddenPermissions(strapi: Core.Strapi) {
  const roleModel = strapi.db.query(ROLE_UID);
  const permissionModel = strapi.db.query(PERMISSION_UID);

  const admin = await roleModel.findOne({ where: { type: 'admin' } });
  if (admin) {
    await permissionModel.deleteMany({
      where: { role: admin.id, action: { $in: BUSINESS_ACTIONS } },
    });
    await permissionModel.deleteMany({
      where: { role: admin.id, action: { $in: REVOKED_ADMIN_ACTIONS } },
    });
  }

  const oas = await roleModel.findOne({ where: { type: 'oas' } });
  if (oas) {
    await permissionModel.deleteMany({
      where: { role: oas.id, action: { $in: OAS_FORBIDDEN_ACTIONS } },
    });
  }
}

async function ensureRole(strapi: Core.Strapi, role: { type: string; name: string; description: string }) {
  const roleModel = strapi.db.query(ROLE_UID);
  let existing = await roleModel.findOne({ where: { type: role.type } });

  if (!existing) {
    const roleService = strapi.plugin('users-permissions').service('role');
    await roleService.createRole({
      name: role.name,
      description: role.description,
      type: role.type,
    });

    existing = await roleModel.findOne({ where: { type: role.type } });
    if (!existing) {
      throw new Error(`Failed to create the "${role.name}" role`);
    }
  }

  const permissionService = strapi.plugin('users-permissions').service('permission');
  const rolePermissions = await permissionService.findRolePermissions(existing.id);

  // Clone the permissions of the default "Authenticated" role so newly
  // created public roles can call the core user/API endpoints. This also
  // repairs roles that were created without permissions in earlier runs.
  if (rolePermissions.length === 0) {
    const authenticated = await roleModel.findOne({ where: { type: 'authenticated' } });

    if (authenticated) {
      const authenticatedPermissions = await permissionService.findRolePermissions(authenticated.id);

      await Promise.all(
        authenticatedPermissions.map((permission: { action: string }) =>
          strapi.db.query(PERMISSION_UID).create({
            data: { action: permission.action, role: existing.id },
          })
        )
      );
    }
  }

  return existing;
}

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    for (const role of PUBLIC_ROLES) {
      await ensureRole(strapi, role);
    }

    await ensureRolePermissions(strapi);
    await pruneForbiddenPermissions(strapi);

    await ensureSystemSettings(strapi);
    await registerBackupCron(strapi);
    await registerMaintenanceCron(strapi);
  },
};

const SYSTEM_SETTINGS_UID = 'api::system-settings.system-setting';

// Seed the persisted system configuration singleType so runtime code and the
// admin settings page always have a value to read.
async function ensureSystemSettings(strapi: Core.Strapi) {
  try {
    const model = strapi.db.query(SYSTEM_SETTINGS_UID);
    const existing = await model.findOne({});
    if (!existing) {
      await model.create({ data: {} });
    }
  } catch (err) {
    strapi.log.error('Could not seed system settings:', err);
  }
}

// Daily maintenance: flips past-due unpaid bills to Overdue so the OAS
// dashboard and bill monitoring reflect the true collection state.
async function registerMaintenanceCron(strapi: Core.Strapi) {
  try {
    strapi.cron.add({
      '0 3 * * *': async ({ strapi: s }: { strapi: Core.Strapi }) => {
        try {
          const count = await s.service('api::bill.bill')?.markOverdueBills?.();
          if (count) {
            strapi.log.info(`Marked ${count} bill(s) overdue.`);
          }
        } catch (err) {
          await recordAudit(s, {
            action: 'system-error',
            entityType: 'bill',
            description: `Overdue bill sweep failed: ${(err as Error).message}`,
          });
        }
      },
    });
  } catch (err) {
    strapi.log.error('Could not register maintenance cron:', err);
  }
}
// Scheduled database backup. The cron expression and retention window are
// read from the persisted settings; a restart is required after changing the
// schedule in the admin UI.
async function registerBackupCron(strapi: Core.Strapi) {
  try {
    const settings = await getSettings(strapi);
    const expression = (settings.backupScheduleCron as string) ?? '0 2 * * *';

    strapi.cron.add({
      [expression]: async ({ strapi: s }: { strapi: Core.Strapi }) => {
        const current = await getSettings(s);
        if (!current.backupsEnabled) {
          return;
        }
        try {
          await createBackup(s);
          await pruneBackups(s, Number(current.backupRetentionDays ?? 7));
        } catch (err) {
          await recordAudit(s, {
            action: 'system-error',
            entityType: 'backup',
            description: `Scheduled database backup failed: ${(err as Error).message}`,
          });
        }
      },
    });
  } catch (err) {
    strapi.log.error('Could not register backup cron:', err);
  }
}
