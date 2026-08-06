/**
 * system-settings service
 *
 * Exposes the persisted system configuration (account policy, notification
 * preferences, upload restrictions, backup schedule). Runtime code reads
 * settings through `getSettings()` so behaviour is driven by the database
 * instead of hardcoded constants.
 */

import { factories } from '@strapi/strapi';

export const SYSTEM_SETTINGS_UID = 'api::system-settings.system-setting';

export const SYSTEM_SETTINGS_DEFAULTS: Record<string, unknown> = {
  systemName: 'iMapSU',
  systemStatus: 'operational',
  maintenanceBanner: '',
  passwordMinLength: 8,
  passwordRequireUppercase: true,
  passwordRequireNumber: true,
  passwordRequireSymbol: false,
  passwordMaxAgeDays: null,
  accountLockoutThreshold: 5,
  accountLockoutWindowMinutes: 10,
  accountLockoutDurationMinutes: 30,
  uploadMaxFileMb: 10,
  uploadAllowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  notificationEmailEnabled: true,
  notifyOnApplication: true,
  notifyOnTicket: true,
  notifyOnReceipt: true,
  notifyOnFollowUp: true,
  backupsEnabled: true,
  backupScheduleCron: '0 2 * * *',
  backupRetentionDays: 7,
};

export async function getSettings(strapi: any): Promise<Record<string, any>> {
  let entry: Record<string, any> | null = null;
  try {
    entry = await strapi.db.query(SYSTEM_SETTINGS_UID).findOne({});
  } catch {
    entry = null;
  }
  if (!entry) {
    return { ...SYSTEM_SETTINGS_DEFAULTS };
  }
  return { ...SYSTEM_SETTINGS_DEFAULTS, ...entry };
}

export default factories.createCoreService(SYSTEM_SETTINGS_UID, () => ({}));
