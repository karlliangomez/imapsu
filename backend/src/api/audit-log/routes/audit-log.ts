/**
 * audit-log router
 *
 * Read/delete surface only; entries are created server-side.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/audit-logs',
      handler: 'api::audit-log.audit-log.find',
      config: {
        auth: {
          scope: ['api::audit-log.audit-log.find'],
        },
      },
    },
    {
      method: 'GET',
      path: '/audit-logs/:id',
      handler: 'api::audit-log.audit-log.findOne',
      config: {
        auth: {
          scope: ['api::audit-log.audit-log.findOne'],
        },
      },
    },
    {
      method: 'DELETE',
      path: '/audit-logs/:id',
      handler: 'api::audit-log.audit-log.delete',
      config: {
        auth: {
          scope: ['api::audit-log.audit-log.delete'],
        },
      },
    },
    {
      method: 'DELETE',
      path: '/audit-logs',
      handler: 'api::audit-log.audit-log.deleteAll',
      config: {
        auth: {
          scope: ['api::audit-log.audit-log.delete'],
        },
      },
    },
  ],
};
