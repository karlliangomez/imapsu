/**
 * auth controller
 */

import { errors } from '@strapi/utils';
import { isAdmin, isStaff } from '../../../utils/access';
import { auditActor, recordAudit } from '../../../utils/audit-log';

const { ApplicationError, ValidationError } = errors;

const USER_MODEL_UID = 'plugin::users-permissions.user';
const ROLE_MODEL_UID = 'plugin::users-permissions.role';
const PERMISSION_MODEL_UID = 'plugin::users-permissions.permission';

// Roles that a user is allowed to self-assign on registration.
// "Current Tenant" is intentionally excluded; it is granted by an
// administrator after the contract signing process is completed.
const ALLOWED_REGISTER_ROLES = ['student', 'aspiring-tenant'];
const DEFAULT_REGISTER_ROLE = 'student';

// Tenant-facing roles an OAS member may assign when creating an account on
// behalf of a new tenant.
const STAFF_CREATE_ROLES = ['student', 'aspiring-tenant', 'current-tenant'];
const DEFAULT_STAFF_CREATE_ROLE = 'current-tenant';

// Every role an administrator may create or assign. Administrators can also
// provision OAS and administrator accounts.
const ALL_ROLES = ['student', 'aspiring-tenant', 'current-tenant', 'oas', 'admin'];

// The roles an administrator may manage on the role & permissions page.
// The built-in `public` and `authenticated` roles are intentionally excluded.
const MANAGED_ROLES = [...ALL_ROLES];

// Curated catalog of permission actions exposed on the role & permissions
// page. Only these actions are ever added/removed by the admin UI; every
// other permission a role holds is left untouched.
const PERMISSION_CATALOG = [
  {
    label: 'Announcements',
    actions: [
      'api::announcement.announcement.find',
      'api::announcement.announcement.findOne',
      'api::announcement.announcement.create',
      'api::announcement.announcement.update',
      'api::announcement.announcement.delete',
    ],
  },
  {
    label: 'Properties',
    actions: [
      'api::property-space.property-space.find',
      'api::property-space.property-space.findOne',
      'api::property-space.property-space.create',
      'api::property-space.property-space.update',
      'api::property-space.property-space.delete',
    ],
  },
  {
    label: 'Rental applications',
    actions: [
      'api::rental-application.rental-application.find',
      'api::rental-application.rental-application.findOne',
      'api::rental-application.rental-application.create',
      'api::rental-application.rental-application.update',
      'api::rental-application.rental-application.delete',
    ],
  },
  {
    label: 'Tenancies',
    actions: [
      'api::tenancy.tenancy.find',
      'api::tenancy.tenancy.findOne',
      'api::tenancy.tenancy.create',
      'api::tenancy.tenancy.update',
      'api::tenancy.tenancy.delete',
    ],
  },
  {
    label: 'Bills',
    actions: [
      'api::bill.bill.find',
      'api::bill.bill.findOne',
      'api::bill.bill.create',
      'api::bill.bill.update',
      'api::bill.bill.delete',
    ],
  },
  {
    label: 'Contract renewals',
    actions: [
      'api::renewal-intent.renewal-intent.find',
      'api::renewal-intent.renewal-intent.findOne',
      'api::renewal-intent.renewal-intent.create',
      'api::renewal-intent.renewal-intent.update',
      'api::renewal-intent.renewal-intent.delete',
    ],
  },
  {
    label: 'Maintenance tickets',
    actions: [
      'api::maintenance-ticket.maintenance-ticket.find',
      'api::maintenance-ticket.maintenance-ticket.findOne',
      'api::maintenance-ticket.maintenance-ticket.create',
      'api::maintenance-ticket.maintenance-ticket.update',
      'api::maintenance-ticket.maintenance-ticket.delete',
    ],
  },
  {
    label: 'Feedback',
    actions: [
      'api::feedback.feedback.find',
      'api::feedback.feedback.findOne',
      'api::feedback.feedback.create',
    ],
  },
  {
    label: 'Users',
    actions: [
      'plugin::users-permissions.user.find',
      'plugin::users-permissions.user.findOne',
      'plugin::users-permissions.user.update',
      'plugin::users-permissions.user.destroy',
    ],
  },
  {
    label: 'File uploads',
    actions: ['plugin::upload.content-api.upload'],
  },
];

const CATALOG_ACTIONS = new Set(PERMISSION_CATALOG.flatMap((section) => section.actions));

// Actions that can never be removed through the permissions page.
const PROTECTED_ACTIONS = new Set([
  'api::auth.auth.me',
  'api::auth.auth.updateAccount',
]);

async function sanitizeUser(user: unknown) {
  const schema = strapi.getModel(USER_MODEL_UID);
  return strapi.contentAPI.sanitize.output(user, schema, { auth: null });
}

// A password must combine character classes so that weak credentials are
// rejected at registration and password change. Existing accounts are
// unaffected: this only guards new passwords.
function assertStrongPassword(password: string, label = 'Password') {
  if (password.length < 6) {
    throw new ValidationError(`${label} must be at least 6 characters long`);
  }
  if (!/[A-Z]/.test(password)) {
    throw new ValidationError(`${label} must contain at least one uppercase letter`);
  }
  if (!/[a-z]/.test(password)) {
    throw new ValidationError(`${label} must contain at least one lowercase letter`);
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new ValidationError(`${label} must contain at least one symbol (e.g. ! @ # $)`);
  }
}

function validateRegisterBody(body: Record<string, unknown>) {
  const { username, email, password } = body;

  if (typeof username !== 'string' || username.trim().length < 3) {
    throw new ValidationError('Username must be at least 3 characters long');
  }

  if (typeof email !== 'string' || !email.includes('@') || email.trim().length < 5) {
    throw new ValidationError('Please provide a valid email address');
  }

  if (typeof password !== 'string' || !password) {
    throw new ValidationError('Please provide a password');
  }

  assertStrongPassword(password);
}

export default {
  // Sign-in wrapper around the users-permissions local strategy. Every failed
  // attempt is recorded (for the system monitor) and every successful staff
  // sign-in is recorded as administrative access.
  async login(ctx: any) {
    const identifier = String((ctx.request.body ?? {}).identifier ?? '');

    try {
      const authController = strapi.controller('plugin::users-permissions.auth') as unknown as {
        callback: (ctx: any) => Promise<void>;
      };
      await authController.callback(ctx);
    } catch (err) {
      await recordAudit(strapi, {
        action: 'login-failed',
        entityType: 'auth',
        entityLabel: identifier,
        description: 'Failed sign-in attempt',
        actor: { actorUsername: identifier || null },
      });
      throw err;
    }

    const rawUser = (ctx.body as { user?: { id?: number; username?: string } })?.user ?? null;

    if (rawUser?.id) {
      const withRole = await strapi.db.query(USER_MODEL_UID).findOne({
        where: { id: rawUser.id },
        populate: { role: true },
      });
      const roleType = withRole?.role?.type ?? withRole?.role?.name ?? null;
      const username = withRole?.username ?? rawUser.username ?? String(rawUser.id);

      if (roleType === 'admin' || roleType === 'oas') {
        await recordAudit(strapi, {
          action: 'login-success',
          entityType: 'auth',
          entityId: rawUser.id,
          entityLabel: username,
          description: `${username} signed in as ${roleType}`,
          actor: {
            actorId: rawUser.id,
            actorUsername: username,
            actorRole: roleType,
          },
        });
      }
    }
  },

  async registerWithRole(ctx: any) {
    const body: Record<string, unknown> = ctx.request.body ?? {};

    validateRegisterBody(body);

    const email = String(body.email).trim().toLowerCase();
    const username = String(body.username).trim();
    const roleType = ALLOWED_REGISTER_ROLES.includes(String(body.role))
      ? String(body.role)
      : DEFAULT_REGISTER_ROLE;

    const role = await strapi.db.query(ROLE_MODEL_UID).findOne({ where: { type: roleType } });
    if (!role) {
      throw new ApplicationError('Impossible to find the requested role');
    }

    const userService = strapi.plugin('users-permissions').service('user');
    const conflicting = await userService.count({
      $or: [{ email }, { username }, { email: username }, { username: email }],
    });

    if (conflicting > 0) {
      throw new ApplicationError('Email or username is already taken');
    }

    const user = await userService.add({
      username,
      email,
      password: String(body.password),
      provider: 'local',
      confirmed: true,
      role: role.id,
    });

    const jwtService = strapi.plugin('users-permissions').service('jwt');
    const jwt = await jwtService.issue({ id: user.id });

    ctx.send({
      jwt,
      user: await sanitizeUser(user),
    });
  },

  // Staff-only: create a tenant-facing account on behalf of a new tenant
  // (used by the tenancy creation form). Returns the created user so the
  // caller can link it to a tenancy immediately.
  async createUserByStaff(ctx: any) {
    const authUser = ctx.state.user;
    if (!authUser) {
      return ctx.unauthorized();
    }
    if (!isStaff(authUser)) {
      return ctx.forbidden();
    }

    const body: Record<string, unknown> = ctx.request.body ?? {};

    validateRegisterBody(body);

    const email = String(body.email).trim().toLowerCase();
    const username = String(body.username).trim();

    // Administrators may provision accounts for any role (including OAS and
    // other administrators); OAS members may only create tenant-facing accounts.
    const roleType = isAdmin(authUser)
      ? ALL_ROLES.includes(String(body.role))
        ? String(body.role)
        : DEFAULT_STAFF_CREATE_ROLE
      : STAFF_CREATE_ROLES.includes(String(body.role))
        ? String(body.role)
        : DEFAULT_STAFF_CREATE_ROLE;

    const role = await strapi.db.query(ROLE_MODEL_UID).findOne({ where: { type: roleType } });
    if (!role) {
      throw new ApplicationError('Impossible to find the requested role');
    }

    const userService = strapi.plugin('users-permissions').service('user');
    const conflicting = await userService.count({
      $or: [{ email }, { username }, { email: username }, { username: email }],
    });

    if (conflicting > 0) {
      throw new ApplicationError('Email or username is already taken');
    }

    const user = await userService.add({
      username,
      email,
      password: String(body.password),
      provider: 'local',
      confirmed: true,
      role: role.id,
    });

    await recordAudit(strapi, {
      action: 'account-created',
      entityType: 'user',
      entityId: user.id,
      entityLabel: username,
      description: `Created ${role.name} account ${username} (${email})`,
      actor: auditActor(authUser),
    });

    ctx.body = {
      id: user.id,
      documentId: user.documentId,
      username: user.username,
      email: user.email,
      role: { name: role.name, type: role.type },
    };
  },

  async me(ctx: any) {
    const authUser = ctx.state.user;
    if (!authUser) {
      return ctx.unauthorized();
    }

    const user = await strapi
      .plugin('users-permissions')
      .service('user')
      .fetchAuthenticatedUser(authUser.id);

    const schema = strapi.getModel(USER_MODEL_UID);
    ctx.body = await strapi.contentAPI.sanitize.output(user, schema, {
      auth: null,
    });
  },

  // Self-service: a signed-in user changes their own password. Username and
  // email are administrator-managed and must be changed through the admin
  // user directory (`/api/users/:id`) instead.
  async updateAccount(ctx: any) {
    const authUser = ctx.state.user;
    if (!authUser) {
      return ctx.unauthorized();
    }

    const userService = strapi.plugin('users-permissions').service('user');
    const existing = await userService.fetchAuthenticatedUser(authUser.id);
    if (!existing) {
      return ctx.unauthorized();
    }

    const body: Record<string, unknown> = ctx.request.body ?? {};

    if (body.username !== undefined || body.email !== undefined) {
      throw new ValidationError('Only an administrator can change the username or email');
    }

    const hasCurrent = body.currentPassword !== undefined;
    const hasNew = body.newPassword !== undefined;
    if (hasCurrent || hasNew) {
      if (!hasCurrent || !hasNew) {
        throw new ValidationError('Both your current password and a new password are required to change it');
      }
      assertStrongPassword(String(body.newPassword), 'New password');
      const valid = await userService.validatePassword(String(body.currentPassword), existing.password);
      if (!valid) {
        throw new ValidationError('Current password is incorrect');
      }

      const updated = await userService.edit(authUser.id, { password: String(body.newPassword) });
      ctx.body = await sanitizeUser(updated);
      return;
    }

    throw new ValidationError('Nothing to update');
  },

  // Staff-only directory: users together with their role type. The standard
  // `/api/users` endpoint strips the role relation, which the admin UI needs.
  async userDirectory(ctx: any) {
    const authUser = ctx.state.user;
    if (!authUser) {
      return ctx.unauthorized();
    }

    const rows = await strapi.db.query(USER_MODEL_UID).findMany({
      populate: { role: true },
      orderBy: { id: 'asc' },
    });

    ctx.body = rows.map((user: any) => ({
      id: user.id,
      documentId: user.documentId,
      username: user.username,
      email: user.email,
      confirmed: user.confirmed,
      blocked: user.blocked,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role ? { documentId: user.role.documentId, name: user.role.name, type: user.role.type } : null,
    }));
  },

  // Admin-only: update a user's username, email and/or role. The self-service
  // `/auth/account` endpoint never touches these fields; they are managed here.
  async updateUserByStaff(ctx: any) {
    const authUser = ctx.state.user;
    if (!authUser) {
      return ctx.unauthorized();
    }
    if (!isAdmin(authUser)) {
      return ctx.forbidden('Only administrators can update user accounts');
    }

    const targetId = Number(ctx.params.id);
    if (!Number.isInteger(targetId)) {
      throw new ValidationError('Invalid user id');
    }

    const userService = strapi.plugin('users-permissions').service('user');
    const target = await userService.fetch(targetId);
    if (!target) {
      throw new ApplicationError('User not found');
    }

    const previous = await strapi.db.query(USER_MODEL_UID).findOne({
      where: { id: targetId },
      populate: { role: true },
    });
    const previousRoleType = previous?.role?.type ?? previous?.role?.name ?? null;

    const body: Record<string, unknown> = ctx.request.body ?? {};
    const patch: Record<string, unknown> = {};
    const changes: string[] = [];

    if (body.username !== undefined) {
      const username = String(body.username).trim();
      if (username.length < 3) {
        throw new ValidationError('Username must be at least 3 characters long');
      }
      if (username !== target.username) {
        const clash = await userService.count({ username });
        if (clash > 0) {
          throw new ApplicationError('Username is already taken');
        }
      }
      patch.username = username;
      changes.push('username');
    }

    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!email.includes('@') || email.length < 5) {
        throw new ValidationError('Please provide a valid email address');
      }
      if (email !== target.email) {
        const clash = await userService.count({ email });
        if (clash > 0) {
          throw new ApplicationError('Email is already taken');
        }
      }
      patch.email = email;
      changes.push('email');
    }

    if (body.role !== undefined) {
      const roleType = String(body.role);
      const role = await strapi.db.query(ROLE_MODEL_UID).findOne({ where: { type: roleType } });
      if (!role) {
        throw new ApplicationError('Invalid role');
      }
      patch.role = role.id;
      changes.push('role');
    }

    if (body.blocked !== undefined) {
      patch.blocked = Boolean(body.blocked);
      changes.push('blocked');
    }

    if (body.confirmed !== undefined) {
      patch.confirmed = Boolean(body.confirmed);
      changes.push('confirmed');
    }

    if (body.password !== undefined) {
      const password = String(body.password);
      assertStrongPassword(password);
      patch.password = password;
      changes.push('password');
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError('Nothing to update');
    }

    await userService.edit(targetId, patch);

    const updated = await strapi.db.query(USER_MODEL_UID).findOne({
      where: { id: targetId },
      populate: { role: true },
    });

    const actor = auditActor(authUser);
    const finalRoleType = updated?.role?.type ?? updated?.role?.name ?? null;
    const label = updated?.username ?? String(targetId);

    if (changes.includes('role') && finalRoleType !== previousRoleType) {
      await recordAudit(strapi, {
        action: 'role-changed',
        entityType: 'user',
        entityId: targetId,
        entityLabel: label,
        description: `Changed ${label}'s role from ${previousRoleType ?? 'none'} to ${finalRoleType ?? 'none'}`,
        actor,
      });
    }

    if (changes.includes('blocked')) {
      await recordAudit(strapi, {
        action: body.blocked ? 'account-deactivated' : 'account-activated',
        entityType: 'user',
        entityId: targetId,
        entityLabel: label,
        description: body.blocked
          ? `Deactivated account ${label}`
          : `Reactivated account ${label}`,
        actor,
      });
    }

    await recordAudit(strapi, {
      action: 'account-updated',
      entityType: 'user',
      entityId: targetId,
      entityLabel: label,
      description: `Updated account ${label}${changes.length ? ` (${changes.join(', ')})` : ''}`,
      actor,
    });

    ctx.body = {
      id: updated.id,
      documentId: updated.documentId,
      username: updated.username,
      email: updated.email,
      confirmed: updated.confirmed,
      blocked: updated.blocked,
      role: updated.role ? { documentId: updated.role.documentId, name: updated.role.name, type: updated.role.type } : null,
    };
  },

  // Admin-only: permanently remove a user account.
  async deleteUserByStaff(ctx: any) {
    const authUser = ctx.state.user;
    if (!authUser) {
      return ctx.unauthorized();
    }
    if (!isAdmin(authUser)) {
      return ctx.forbidden('Only administrators can delete user accounts');
    }

    const targetId = Number(ctx.params.id);
    if (!Number.isInteger(targetId)) {
      throw new ValidationError('Invalid user id');
    }
    if (targetId === authUser.id) {
      throw new ValidationError('You cannot delete your own account');
    }

    const userService = strapi.plugin('users-permissions').service('user');
    const target = await userService.fetch(targetId);
    if (!target) {
      throw new ApplicationError('User not found');
    }

    const role = target.role?.type ?? target.role?.name ?? null;

    await userService.remove({ id: targetId });

    await recordAudit(strapi, {
      action: 'account-deleted',
      entityType: 'user',
      entityId: targetId,
      entityLabel: target.username,
      description: `Deleted ${role ?? 'user'} account ${target.username} (${target.email})`,
      actor: auditActor(authUser),
    });

    ctx.body = { id: targetId, deleted: true };
  },

  // Admin-only: roles together with the permission actions they currently
  // hold. Used by the role & permissions page.
  async listRoles(ctx: any) {
    const authUser = ctx.state.user;
    if (!authUser) {
      return ctx.unauthorized();
    }
    if (!isAdmin(authUser)) {
      return ctx.forbidden('Only administrators can manage roles');
    }

    const roles = await strapi.db.query(ROLE_MODEL_UID).findMany({
      where: { type: { $in: MANAGED_ROLES } },
      populate: { permissions: { select: ['action'] } },
      orderBy: { id: 'asc' },
    });

    ctx.body = roles.map((role: { type?: string; name?: string; description?: string; permissions?: { action?: string }[] }) => ({
      type: role.type ?? null,
      name: role.name ?? null,
      description: role.description ?? null,
      permissions: (role.permissions ?? []).map((permission) => permission.action).filter((action): action is string => typeof action === 'string'),
    }));
  },

  // Admin-only: reconcile the catalog permission actions for one role.
  // Non-catalog permissions are never touched; protected actions are always
  // restored so a role can never be locked out of the essentials.
  async updateRolePermissions(ctx: any) {
    const authUser = ctx.state.user;
    if (!authUser) {
      return ctx.unauthorized();
    }
    if (!isAdmin(authUser)) {
      return ctx.forbidden('Only administrators can manage roles');
    }

    const roleType = String(ctx.params.type);
    if (!MANAGED_ROLES.includes(roleType)) {
      throw new ValidationError('This role cannot be modified');
    }

    const role = await strapi.db.query(ROLE_MODEL_UID).findOne({ where: { type: roleType } });
    if (!role) {
      throw new ApplicationError('Role not found');
    }

    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const requested = Array.isArray(body.actions) ? body.actions.filter((action): action is string => typeof action === 'string') : [];
    const requestedSet = new Set(requested);

    for (const action of PROTECTED_ACTIONS) {
      requestedSet.add(action);
    }
    if (roleType === 'admin') {
      for (const action of [
        'plugin::users-permissions.user.find',
        'plugin::users-permissions.user.findOne',
        'plugin::users-permissions.user.update',
        'plugin::users-permissions.user.destroy',
      ]) {
        requestedSet.add(action);
      }
    }

    const current = await strapi.db.query(PERMISSION_MODEL_UID).findMany({
      where: { role: role.id },
      select: ['id', 'action'],
    });
    const currentByAction = new Map(current.map((permission: { action?: string; id?: number }) => [permission.action, permission.id]));

    for (const permission of current) {
      if (CATALOG_ACTIONS.has(permission.action ?? '') && !requestedSet.has(permission.action ?? '')) {
        await strapi.db.query(PERMISSION_MODEL_UID).delete({ where: { id: permission.id } });
      }
    }

    for (const action of requestedSet) {
      if (CATALOG_ACTIONS.has(action) && !currentByAction.has(action)) {
        await strapi.db.query(PERMISSION_MODEL_UID).create({
          data: { action, role: role.id, enabled: true },
        });
      }
    }

    const finalPermissions = await strapi.db.query(PERMISSION_MODEL_UID).findMany({
      where: { role: role.id },
      select: ['action'],
    });

    await recordAudit(strapi, {
      action: 'permissions-updated',
      entityType: 'role',
      entityId: role.type,
      entityLabel: role.name,
      description: `Updated permissions for the ${role.name} role`,
      actor: auditActor(authUser),
    });

    ctx.body = {
      ok: true,
      roleType,
      permissions: finalPermissions.map((permission: { action?: string }) => permission.action).filter((action): action is string => typeof action === 'string'),
    };
  },
};
