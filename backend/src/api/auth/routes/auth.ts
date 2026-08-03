/**
 * auth router
 */

export default {
  routes: [
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
          scope: ['plugin::users-permissions.user.find'],
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
  ],
};
