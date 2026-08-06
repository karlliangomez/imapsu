/**
 * notification router
 *
 * Read/update surface only; entries are created server-side.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/notifications',
      handler: 'api::notification.notification.find',
      config: {
        auth: {
          scope: ['api::notification.notification.find'],
        },
      },
    },
    {
      method: 'GET',
      path: '/notifications/unread-count',
      handler: 'api::notification.notification.unreadCount',
      config: {
        auth: {
          scope: ['api::notification.notification.unreadCount'],
        },
      },
    },
    {
      method: 'PUT',
      path: '/notifications/:id/read',
      handler: 'api::notification.notification.markRead',
      config: {
        auth: {
          scope: ['api::notification.notification.markRead'],
        },
      },
    },
    {
      method: 'PUT',
      path: '/notifications/read-all',
      handler: 'api::notification.notification.markAllRead',
      config: {
        auth: {
          scope: ['api::notification.notification.markAllRead'],
        },
      },
    },
  ],
};
