/**
 * system router
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/system/health',
      handler: 'api::system.system.health',
      config: {
        auth: {
          scope: ['api::system.system.health'],
        },
      },
    },
  ],
};
