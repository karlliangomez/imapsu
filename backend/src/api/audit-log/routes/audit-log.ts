/**
 * audit-log router
 *
 * Read-only surface: audit entries are written server-side and are
 * deliberately append-only — they cannot be edited or deleted through any
 * user-facing function.
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
  ],
};
