/**
 * auth controller
 */

import { errors } from '@strapi/utils';

const { ApplicationError, ValidationError } = errors;

const USER_MODEL_UID = 'plugin::users-permissions.user';
const ROLE_MODEL_UID = 'plugin::users-permissions.role';

// Roles that a user is allowed to self-assign on registration.
// "Current Tenant" is intentionally excluded; it is granted by an
// administrator after the contract signing process is completed.
const ALLOWED_REGISTER_ROLES = ['student', 'aspiring-tenant'];
const DEFAULT_REGISTER_ROLE = 'student';

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
