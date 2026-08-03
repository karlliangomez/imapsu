/**
 * Global error-capture middleware.
 *
 * Sits after `strapi::errors` so any server error thrown by the routers
 * beneath it is recorded in the audit log before it is re-thrown for the
 * default error handler to answer.
 */

import type { Core } from '@strapi/strapi';
import { auditActor, recordAudit } from '../utils/audit-log';

export default (config: unknown, { strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    try {
      await next();
    } catch (err) {
      const status = Number((err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode ?? 500);

      if (status >= 500) {
        await recordAudit(strapi, {
          action: 'system-error',
          entityType: 'system',
          entityLabel: `${ctx.method ?? ''} ${ctx.originalUrl ?? ctx.url ?? ''}`.trim(),
          description: (err as Error)?.message ?? String(err),
          actor: auditActor(ctx?.state?.user ?? null),
        });
      }

      throw err;
    }
  };
};
