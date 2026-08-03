/**
 * Global write-audit middleware.
 *
 * Records every successful content-API create/update/delete for the
 * OAS-managed business entities (announcements, properties, rental
 * applications, tenancies, bills, renewal intents, maintenance tickets,
 * feedback). It is deliberately generic: it whitelists the entity paths and
 * reads the actor from the request user, so it also covers writes performed
 * by regular tenants/students without touching any controller.
 */

import type { Core } from '@strapi/strapi';
import { auditActor, recordAudit } from '../utils/audit-log';

const ENTITY_BY_SEGMENT: Record<string, string> = {
  announcements: 'api::announcement.announcement',
  properties: 'api::property-space.property-space',
  'rental-applications': 'api::rental-application.rental-application',
  tenancies: 'api::tenancy.tenancy',
  bills: 'api::bill.bill',
  'renewal-intents': 'api::renewal-intent.renewal-intent',
  'maintenance-tickets': 'api::maintenance-ticket.maintenance-ticket',
  feedbacks: 'api::feedback.feedback',
};

function extractLabel(data: Record<string, unknown> | undefined): string | null {
  if (!data) {
    return null;
  }
  for (const key of ['title', 'name', 'subject', 'period', 'propertyName', 'propertyCode', 'tenantName']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

export default (config: unknown, { strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(ctx.method)) {
      return next();
    }

    const url = (ctx.originalUrl ?? ctx.url ?? '') as string;
    const segments = url.split('?')[0].replace(/\/+$/, '').split('/').filter(Boolean);

    let entityType: string | undefined;
    for (const segment of segments) {
      if (ENTITY_BY_SEGMENT[segment]) {
        entityType = ENTITY_BY_SEGMENT[segment];
        break;
      }
    }
    if (!entityType) {
      return next();
    }

    try {
      await next();
    } catch (err) {
      throw err;
    }

    if ((ctx.status ?? 200) >= 400) {
      return;
    }

    const action = ctx.method === 'POST' ? 'created' : ctx.method === 'DELETE' ? 'deleted' : 'updated';
    const body = (ctx.body ?? {}) as { data?: Record<string, unknown> | Record<string, unknown>[] | null } | null;
    const data = body?.data;
    const doc = Array.isArray(data) ? data[0] : data;
    const id = doc?.id ?? doc?.documentId ?? ctx.params?.id ?? null;

    await recordAudit(strapi, {
      action,
      entityType,
      entityId: id != null ? String(id) : null,
      entityLabel: extractLabel(doc as Record<string, unknown> | undefined),
      description: `${action} ${entityType}`,
      actor: auditActor(ctx.state.user),
    });
  };
};
