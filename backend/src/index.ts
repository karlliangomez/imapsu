import type { Core } from '@strapi/strapi';

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
  'api::feedback.feedback.find',
  'api::feedback.feedback.findOne',
  'api::feedback.feedback.create',
  'plugin::upload.content-api.upload',
  'plugin::upload.content-api.find',
];

// OAS must never manage existing users: account creation (tenancy flow) only.
const OAS_FORBIDDEN_ACTIONS = [
  'plugin::users-permissions.user.find',
  'plugin::users-permissions.user.findOne',
  'plugin::users-permissions.user.update',
  'plugin::users-permissions.user.destroy',
];

// Content-API actions granted to each role. The authenticated role only gets
// the shared baseline (announcements + properties read); role-specific
// capabilities are granted to the custom public roles below. Properties are
// intentionally NOT readable by the public role.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  public: [
    ...ANNOUNCEMENT_READ,
  ],
  authenticated: [
    'api::auth.auth.me',
    'api::auth.auth.updateAccount',
    ...PROPERTY_READ,
    ...ANNOUNCEMENT_READ,
  ],
  student: [
    'api::auth.auth.me',
    'api::auth.auth.updateAccount',
    ...PROPERTY_READ,
    ...ANNOUNCEMENT_READ,
    'api::feedback.feedback.find',
    'api::feedback.feedback.findOne',
    'api::feedback.feedback.create',
  ],
  'aspiring-tenant': [
    'api::auth.auth.me',
    'api::auth.auth.updateAccount',
    ...PROPERTY_READ,
    ...ANNOUNCEMENT_READ,
    'api::rental-application.rental-application.find',
    'api::rental-application.rental-application.findOne',
    'api::rental-application.rental-application.create',
    'api::rental-application.rental-application.update',
    'plugin::upload.content-api.upload',
  ],
  'current-tenant': [
    'api::auth.auth.me',
    'api::auth.auth.updateAccount',
    ...PROPERTY_READ,
    ...ANNOUNCEMENT_READ,
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
    'plugin::upload.content-api.upload',
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
    'api::feedback.feedback.find',
    'api::feedback.feedback.findOne',
    // Tenancy-flow account creation only: OAS can create tenant-facing
    // accounts but cannot list, edit or delete existing users.
    'api::auth.auth.createUserByStaff',
    'plugin::upload.content-api.upload',
    'plugin::upload.content-api.find',
  ],
  admin: [
    'api::auth.auth.me',
    'api::auth.auth.updateAccount',
    // User management (list, inspect, create, edit, block/unblock, delete).
    'api::auth.auth.createUserByStaff',
    'plugin::users-permissions.user.find',
    'plugin::users-permissions.user.findOne',
    'plugin::users-permissions.user.update',
    'plugin::users-permissions.user.destroy',
    // Roles & permissions management.
    'api::auth.auth.listRoles',
    'api::auth.auth.updateRolePermissions',
    // Audit logs.
    'api::audit-log.audit-log.find',
    'api::audit-log.audit-log.findOne',
    'api::audit-log.audit-log.delete',
    // System monitoring.
    'api::system.system.health',
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
  },
};
