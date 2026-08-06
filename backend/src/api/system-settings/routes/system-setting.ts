/**
 * system-settings router
 *
 * GET returns the persisted configuration; PUT creates or updates the
 * singleType entry. Both are restricted to administrators via scope.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/system-settings',
      handler: 'api::system-settings.system-setting.find',
      config: {
        auth: {
          scope: ['api::system-settings.system-setting.find'],
        },
      },
    },
    {
      method: 'PUT',
      path: '/system-settings',
      handler: 'api::system-settings.system-setting.update',
      config: {
        auth: {
          scope: ['api::system-settings.system-setting.update'],
        },
      },
    },
  ],
};
