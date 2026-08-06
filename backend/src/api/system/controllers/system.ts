/**
 * system controller
 *
 * Admin-only health/monitoring surface: uptime, memory, disk usage,
 * database connectivity, failed sign-in stats and recorded server errors —
 * plus database backup and recovery.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { isAdmin } from '../../../utils/access';
import { createBackup, listBackups, deleteBackup, restoreBackup, readRequestBody, ensureBackupsDirSync } from '../../../utils/backup';
import { getSettings } from '../../system-settings/services/system-setting';

const AUDIT_UID = 'api::audit-log.audit-log';

function diskInfo(dir: string) {
  try {
    const stats = fs.statfsSync(dir);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    return { ok: true, total, free, used: total - free };
  } catch {
    return { ok: false };
  }
}

export default {
  async health(ctx: any) {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isAdmin(user)) {
      return ctx.forbidden('Only administrators can view system health');
    }

    let database: Record<string, unknown> = { ok: false, latency: null };
    const started = Date.now();
    try {
      await strapi.db.connection.raw('SELECT 1');
      let client: string | null = null;
      try {
        client = strapi.db.dialect?.client ?? null;
      } catch {
        client = null;
      }
      database = { ok: true, latency: Date.now() - started, client };
    } catch (err) {
      database = { ok: false, latency: Date.now() - started, error: (err as Error)?.message ?? 'Database unreachable' };
    }

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const uploadsDir = path.join(strapi.dirs.static.public, 'uploads');

    const countByAction = async (action: string, since?: Date) => {
      const where: Record<string, unknown> = { action };
      if (since) {
        where.createdAt = { $gte: since.toISOString() };
      }
      return strapi.db.query(AUDIT_UID).count({ where });
    };

    const recentByAction = async (action: string, limit: number) => {
      return strapi.db.query(AUDIT_UID).findMany({
        where: { action },
        orderBy: { createdAt: 'desc' },
        limit,
        select: ['id', 'createdAt', 'entityType', 'entityLabel', 'description', 'actorUsername', 'actorRole'],
      });
    };

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [failed24h, failed7d, failedTotal, errorTotal, recentFailed, recentErrors, recentLogins] = await Promise.all([
      countByAction('login-failed', last24h),
      countByAction('login-failed', last7d),
      countByAction('login-failed'),
      countByAction('system-error'),
      recentByAction('login-failed', 10),
      recentByAction('system-error', 10),
      recentByAction('login-success', 5),
    ]);

    ctx.body = {
      uptime: process.uptime(),
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      memory: { total: totalMem, free: freeMem, used: totalMem - freeMem },
      disk: diskInfo(uploadsDir),
      database,
      logins: {
        failed24h,
        failed7d,
        failedTotal,
        recentFailed,
        recentLogins,
      },
      errors: { total: errorTotal, recent: recentErrors },
      now: now.toISOString(),
    };
  },

  // Admin-only: create an on-demand database backup.
  async backup(ctx: any) {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isAdmin(user)) {
      return ctx.forbidden('Only administrators can create backups');
    }

    const started = Date.now();
    try {
      const backup = await createBackup(strapi, user);
      ctx.body = { ok: true, backup, elapsedMs: Date.now() - started };
    } catch (err) {
      ctx.badRequest(`Backup failed: ${(err as Error).message}`);
    }
  },

  // Admin-only: list existing database backups.
  async backupList(ctx: any) {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isAdmin(user)) {
      return ctx.forbidden('Only administrators can list backups');
    }

    ctx.body = { backups: await listBackups(strapi) };
  },

  // Admin-only: restore the database from an uploaded dump file. The raw
  // binary body is streamed to a temporary file and applied with pg_restore.
  async restoreBackup(ctx: any) {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isAdmin(user)) {
      return ctx.forbidden('Only administrators can restore backups');
    }

    try {
      const buffer = await readRequestBody(ctx.req);
      if (buffer.length === 0) {
        return ctx.badRequest('No backup file provided');
      }
      const result = await restoreBackup(strapi, buffer, user);
      ctx.body = { ok: true, ...result };
    } catch (err) {
      ctx.badRequest(`Restore failed: ${(err as Error).message}`);
    }
  },

  // Admin-only: delete a stored database backup file.
  async deleteBackup(ctx: any) {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isAdmin(user)) {
      return ctx.forbidden('Only administrators can delete backups');
    }

    const name = String(ctx.params.name ?? '');
    try {
      const result = await deleteBackup(strapi, name, user);
      ctx.body = { ok: true, ...result };
    } catch (err) {
      ctx.badRequest(`Could not delete backup: ${(err as Error).message}`);
    }
  },

  // Admin-only: retention info used by the backups page.
  async backupSettings(ctx: any) {
    const user = ctx.state.user as { id?: number } | undefined;
    if (!user) {
      return ctx.unauthorized();
    }
    if (!isAdmin(user)) {
      return ctx.forbidden('Only administrators can read backup settings');
    }

    const settings = await getSettings(strapi);
    ctx.body = {
      enabled: Boolean(settings.backupsEnabled),
      scheduleCron: settings.backupScheduleCron ?? '0 2 * * *',
      retentionDays: settings.backupRetentionDays ?? 7,
      backupDir: ensureBackupsDirSync(strapi),
    };
  },
};
