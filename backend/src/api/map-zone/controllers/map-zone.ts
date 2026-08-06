/**
 * map-zone controller
 *
 * Map zones are clickable footprints drawn on the 3D campus map. The `corners`
 * attribute stores a polygon of `{ x, z }` points in the model's ground plane;
 * it is validated here so the 3D renderer can rely on well-formed shapes.
 * Read access is public (guests can browse the campus map); writes are granted
 * to OAS through the permission matrix.
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const { ValidationError } = errors;

const UID = 'api::map-zone.map-zone';

type Corner = { x: number; z: number };

function parseCorners(value: unknown): Corner[] | null {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }

  const points: Corner[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }
    const x = Number((raw as Record<string, unknown>).x);
    const z = Number((raw as Record<string, unknown>).z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return null;
    }
    points.push({ x, z });
  }
  return points;
}

export default factories.createCoreController(UID, ({ strapi }) => {
  const base = (self: unknown) => self as unknown as Core.CoreAPI.Controller.Base;
  const service = () => strapi.service(UID) as unknown as Core.CoreAPI.Service.CollectionType;

  async function assertValidCorners(data: Record<string, unknown>) {
    if (data.corners === undefined) {
      return;
    }
    const corners = parseCorners(data.corners);
    if (!corners) {
      throw new ValidationError('corners must be a polygon of at least 3 { x, z } points');
    }
    data.corners = corners;
  }

  return {
    async create(ctx) {
      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;

      await assertValidCorners(data);

      const ctrl = base(this);
      await ctrl.validateInput(data, ctx);
      const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

      const entity = await service().create({ data: sanitizedData });

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },

    async update(ctx) {
      const body = (ctx.request.body ?? {}) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;

      await assertValidCorners(data);

      const ctrl = base(this);
      await ctrl.validateInput(data, ctx);
      const sanitizedData = (await ctrl.sanitizeInput(data, ctx)) as Record<string, unknown>;

      const entity = await service().update(ctx.params.id, { data: sanitizedData });
      if (!entity) {
        return ctx.notFound();
      }

      const sanitized = await ctrl.sanitizeOutput(entity, ctx);
      return ctrl.transformResponse(sanitized);
    },
  };
});
