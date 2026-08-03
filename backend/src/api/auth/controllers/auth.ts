/**
 * auth controller
 */

import { errors } from '@strapi/utils';
import { isStaff } from '../../../utils/access';

const { ApplicationError, ValidationError } = errors;

const USER_MODEL_UID = 'plugin::users-permissions.user';
const ROLE_MODEL_UID = 'plugin::users-permissions.role';

// Roles that a user is allowed to self-assign on registration.
// "Current Tenant" is intentionally excluded; it is granted by an
// administrator after the contract signing process is completed.
const ALLOWED_REGISTER_ROLES = ['student', 'aspiring-tenant'];
const DEFAULT_REGISTER_ROLE = 'student';

// Tenant-facing roles an administrator/OAS may assign when creating an
// account on behalf of a new tenant.
const STAFF_CREATE_ROLES = ['student', 'aspiring-tenant', 'current-tenant'];
const DEFAULT_STAFF_CREATE_ROLE = 'current-tenant';

async function sanitizeUser(user: unknown) {
  const schema = strapi.getModel(USER_MODEL_UID);
  return strapi.contentAPI.sanitize.output(user, schema, { auth: null });
}

function validateRegisterBody(body: Record<string, unknown>) {
  const { username, email, password } = body;

  if (typeof username !== 'string' || username.trim().length < 3) {
    throw new ValidationError('Username must be at least 3 characters long');
  }

  if (typeof email !== 'string' || !email.includes('@') || email.trim().length < 5) {
    throw new ValidationError('Please provide a valid email address');
  }

  if (typeof password !== 'string' || password.length < 6) {
    throw new ValidationError('Password must be at least 6 characters long');
  }
}

export default {
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
    const roleType = STAFF_CREATE_ROLES.includes(String(body.role))
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

  // Self-service: a signed-in user updates their own profile (username, email)
  // and/or password. The JWT stays valid, so the frontend re-fetches `/auth/me`.
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
    const patch: Record<string, unknown> = {};

    if (body.username !== undefined) {
      const username = String(body.username).trim();
      if (username.length < 3) {
        throw new ValidationError('Username must be at least 3 characters long');
      }
      if (username !== existing.username) {
        const clash = await userService.count({ username });
        if (clash > 0) {
          throw new ApplicationError('Username is already taken');
        }
      }
      patch.username = username;
    }

    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!email.includes('@') || email.length < 5) {
        throw new ValidationError('Please provide a valid email address');
      }
      if (email !== existing.email) {
        const clash = await userService.count({ email });
        if (clash > 0) {
          throw new ApplicationError('Email is already taken');
        }
      }
      patch.email = email;
    }

    const hasCurrent = body.currentPassword !== undefined;
    const hasNew = body.newPassword !== undefined;
    if (hasCurrent || hasNew) {
      if (!hasCurrent || !hasNew) {
        throw new ValidationError('Both your current password and a new password are required to change it');
      }
      if (String(body.newPassword).length < 6) {
        throw new ValidationError('New password must be at least 6 characters long');
      }
      const valid = await userService.validatePassword(String(body.currentPassword), existing.password);
      if (!valid) {
        throw new ValidationError('Current password is incorrect');
      }
      patch.password = String(body.newPassword);
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError('Nothing to update');
    }

    const updated = await userService.edit(authUser.id, patch);
    ctx.body = await sanitizeUser(updated);
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
};
