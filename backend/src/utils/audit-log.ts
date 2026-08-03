/**
 * Shared audit-log helper.
 *
 * Every meaningful action (record create/update/delete, account changes,
 * permission changes, staff sign-ins, failed sign-ins and server errors)
 * is recorded here. Recording is best-effort and must never break the
 * originating request.
 */

import type { Core } from '@strapi/strapi';

const UID = 'api::audit-log.audit-log';

type AuditActor = {
  actorId?: number | null;
  actorUsername?: string | null;
  actorRole?: string | null;
};

/**
 * Normalize a request user (content API user or admin-panel user) into the
 * flat actor fields stored on an audit entry.
 */
export function auditActor(user: unknown): AuditActor {
  if (!user) {
    return { actorId: null, actorUsername: null, actorRole: null };
  }

  const u = user as {
    id?: number | string;
    username?: string;
    name?: string;
    email?: string;
    role?: { type?: string; name?: string } | string | null;
  };

  const role = u.role;
  const actorRole =
    typeof role === 'string'
      ? role
      : role?.type ?? role?.name ?? null;

  return {
    actorId: typeof u.id === 'number' ? u.id : null,
    actorUsername: u.username ?? u.name ?? u.email ?? String(u.id ?? 'system'),
    actorRole: actorRole ?? null,
  };
}

export async function recordAudit(
  strapi: Core.Strapi,
  input: {
    action: string;
    entityType?: string | null;
    entityId?: string | number | null;
    entityLabel?: string | null;
    description?: string | null;
    actor?: AuditActor | null;
  }
) {
  const actor = input.actor ?? {};
  const entityId = input.entityId;

  try {
    await strapi.db.query(UID).create({
      data: {
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: entityId != null ? String(entityId) : null,
        entityLabel: input.entityLabel ?? null,
        description: input.description ?? null,
        actorId: actor.actorId ?? null,
        actorUsername: actor.actorUsername ?? null,
        actorRole: actor.actorRole ?? null,
      },
    });
  } catch {
    // best-effort
  }
}
