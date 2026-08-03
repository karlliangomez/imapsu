/**
 * status-history router
 *
 * Only a staff-scoped lookup is exposed; history records are created
 * server-side by the entity controllers, never through the REST API.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/status-histories',
      handler: 'api::status-history.status-history.findByEntity',
      config: {
        auth: {
          scope: ['plugin::users-permissions.user.find'],
        },
      },
    },
  ],
};
