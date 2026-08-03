/**
 * auth router
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/auth/login',
      handler: 'api::auth.auth.login',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/auth/register-with-role',
      handler: 'api::auth.auth.registerWithRole',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/auth/create-user',
      handler: 'api::auth.auth.createUserByStaff',
      config: {
        auth: {
          scope: ['api::auth.auth.createUserByStaff'],
        },
      },
    },
    {
      method: 'GET',
      path: '/roles',
      handler: 'api::auth.auth.listRoles',
      config: {
        auth: {
          scope: ['api::auth.auth.listRoles'],
        },
      },
    },
    {
      method: 'PUT',
      path: '/roles/:type/permissions',
      handler: 'api::auth.auth.updateRolePermissions',
      config: {
        auth: {
          scope: ['api::auth.auth.updateRolePermissions'],
        },
      },
    },
    {
      method: 'GET',
      path: '/auth/me',
      handler: 'api::auth.auth.me',
      config: {
        auth: {
          scope: [],
        },
      },
    },
    {
      method: 'PUT',
      path: '/auth/account',
      handler: 'api::auth.auth.updateAccount',
      config: {
        auth: {
          scope: [],
        },
      },
    },
    {
      method: 'GET',
      path: '/user-directory',
      handler: 'api::auth.auth.userDirectory',
      config: {
        auth: {
          scope: ['plugin::users-permissions.user.find'],
        },
      },
    },
    {
      method: 'PUT',
      path: '/auth/user/:id',
      handler: 'api::auth.auth.updateUserByStaff',
      config: {
        auth: {
          scope: ['plugin::users-permissions.user.update'],
        },
      },
    },
    {
      method: 'DELETE',
      path: '/auth/user/:id',
      handler: 'api::auth.auth.deleteUserByStaff',
      config: {
        auth: {
          scope: ['plugin::users-permissions.user.destroy'],
        },
      },
    },
  ],
};
