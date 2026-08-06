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
    {
      method: 'POST',
      path: '/system/backups',
      handler: 'api::system.system.backup',
      config: {
        auth: {
          scope: ['api::system.system.backup'],
        },
      },
    },
    {
      method: 'GET',
      path: '/system/backups',
      handler: 'api::system.system.backupList',
      config: {
        auth: {
          scope: ['api::system.system.backupList'],
        },
      },
    },
    {
      method: 'POST',
      path: '/system/backups/restore',
      handler: 'api::system.system.restoreBackup',
      config: {
        auth: {
          scope: ['api::system.system.restoreBackup'],
        },
      },
    },
    {
      method: 'GET',
      path: '/system/backups/settings',
      handler: 'api::system.system.backupSettings',
      config: {
        auth: {
          scope: ['api::system.system.backupList'],
        },
      },
    },
    {
      method: 'DELETE',
      path: '/system/backups/:name',
      handler: 'api::system.system.deleteBackup',
      config: {
        auth: {
          scope: ['api::system.system.deleteBackup'],
        },
      },
    },
  ],
};
