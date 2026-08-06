/**
 * Database backup & recovery helper.
 *
 * Uses the PostgreSQL client tools (`pg_dump` / `pg_restore`) to produce
 * custom-format logical dumps under `<public>/uploads/backups`. Credentials
 * are resolved from the running Strapi database connection so no additional
 * configuration is required. Every operation is best-effort audited.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { recordAudit, auditActor } from './audit-log';

const execFileAsync = promisify(execFile);

export type BackupMeta = {
  name: string;
  size: number;
  createdAt: string;
};

function dbConfig(strapi: any) {
  // Prefer the resolved Strapi configuration (what the running pool actually
  // uses) over knex internals, which differ between versions.
  const configured = (() => {
    try {
      return strapi.config?.get?.('database.connection.connection') ?? null;
    } catch {
      return null;
    }
  })();
  const conn = configured ?? {};
  return {
    host: conn.host ?? process.env.DATABASE_HOST ?? 'localhost',
    port: Number(conn.port ?? process.env.DATABASE_PORT ?? 5432),
    user: conn.user ?? process.env.DATABASE_USERNAME ?? 'postgres',
    password: conn.password ?? process.env.DATABASE_PASSWORD ?? '',
    database: conn.database ?? process.env.DATABASE_NAME ?? 'strapi',
  };
}

export function backupsDir(strapi: any) {
  return path.join(strapi.dirs.static.public, 'uploads', 'backups');
}

async function ensureDir(dir: string) {
  await fsp.mkdir(dir, { recursive: true });
}

function safeBackupName(name: string) {
  const base = path.basename(name);
  if (base !== name || !/^[a-zA-Z0-9._-]+$/.test(base) || !base.endsWith('.dump')) {
    throw new Error('Invalid backup filename');
  }
  return base;
}

export async function createBackup(strapi: any, actor?: unknown) {
  const dir = backupsDir(strapi);
  await ensureDir(dir);

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
    .replace('T', '-')
    .replace('Z', '');
  const name = `imapsu-backup-${stamp}.dump`;
  const target = path.join(dir, name);

  const cfg = dbConfig(strapi);
  await execFileAsync(
    'pg_dump',
    [
      '--no-owner',
      '--no-privileges',
      '--format=custom',
      `--host=${cfg.host}`,
      `--port=${cfg.port}`,
      `--username=${cfg.user}`,
      `--file=${target}`,
      cfg.database,
    ],
    { env: { ...process.env, PGPASSWORD: cfg.password }, maxBuffer: 128 * 1024 * 1024 }
  );

  const stat = await fsp.stat(target);

  await recordAudit(strapi, {
    action: 'backup-created',
    entityType: 'backup',
    entityId: name,
    entityLabel: name,
    description: `Created database backup ${name} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`,
    actor: actor ? auditActor(actor) : null,
  });

  return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
}

export async function listBackups(strapi: any): Promise<BackupMeta[]> {
  const dir = backupsDir(strapi);
  await ensureDir(dir);

  const entries = await fsp.readdir(dir);
  const files: BackupMeta[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.dump')) {
      continue;
    }
    try {
      const stat = await fsp.stat(path.join(dir, entry));
      files.push({ name: entry, size: stat.size, createdAt: stat.mtime.toISOString() });
    } catch {
      // ignore files that vanished mid-list
    }
  }
  return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteBackup(strapi: any, rawName: string, actor?: unknown) {
  const name = safeBackupName(rawName);
  const target = path.join(backupsDir(strapi), name);

  let removed = false;
  try {
    await fsp.unlink(target);
    removed = true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  await recordAudit(strapi, {
    action: 'backup-deleted',
    entityType: 'backup',
    entityId: name,
    entityLabel: name,
    description: removed ? `Deleted database backup ${name}` : `Database backup ${name} not found`,
    actor: actor ? auditActor(actor) : null,
  });

  return { name, deleted: removed };
}

export async function pruneBackups(strapi: any, retentionDays: number) {
  const days = Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const files = await listBackups(strapi);
  const removed: string[] = [];
  for (const file of files) {
    if (new Date(file.createdAt).getTime() < cutoff) {
      try {
        await deleteBackup(strapi, file.name);
        removed.push(file.name);
      } catch {
        // best-effort pruning
      }
    }
  }
  return removed;
}

export async function restoreBackup(strapi: any, buffer: Buffer, actor?: unknown) {
  const dir = backupsDir(strapi);
  await ensureDir(dir);

  const tempName = `restore-${Date.now()}.dump`;
  const tempPath = path.join(dir, tempName);
  await fsp.writeFile(tempPath, buffer);

  try {
    const cfg = dbConfig(strapi);
    await execFileAsync(
      'pg_restore',
      [
        '--no-owner',
        '--no-privileges',
        '--clean',
        '--if-exists',
        `--host=${cfg.host}`,
        `--port=${cfg.port}`,
        `--username=${cfg.user}`,
        `--dbname=${cfg.database}`,
        tempPath,
      ],
      { env: { ...process.env, PGPASSWORD: cfg.password }, maxBuffer: 128 * 1024 * 1024 }
    );

    await recordAudit(strapi, {
      action: 'backup-restored',
      entityType: 'backup',
      entityId: tempName,
      entityLabel: tempName,
      description: `Restored database from uploaded backup (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`,
      actor: actor ? auditActor(actor) : null,
    });

    return { restored: true, file: tempName };
  } finally {
    try {
      await fsp.unlink(tempPath);
    } catch {
      // best-effort cleanup
    }
  }
}

export function readRequestBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function ensureBackupsDirSync(strapi: any) {
  const dir = backupsDir(strapi);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
