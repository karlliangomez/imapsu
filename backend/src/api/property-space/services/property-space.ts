/**
 * property-space service
 *
 * The property code is auto-generated on creation (never typed in by hand),
 * built from the campus building name plus a sequential number, e.g.
 * "MIS Office" -> "MO", giving codes like "MO-001".
 */

import { factories } from '@strapi/strapi';

const UID = 'api::property-space.property-space';

const STOP_WORDS = new Set(['building', 'buildings', 'the', 'of', 'and', 'extension', 'complex']);

// Short uppercase prefix derived from the building name (initials of up to
// three significant words). Falls back to "SP" when nothing usable is given.
function codePrefix(building: unknown): string {
  const words = String(building ?? '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const significant = words.filter((word) => !STOP_WORDS.has(word.toLowerCase()));
  const picked = (significant.length ? significant : words).slice(0, 3);
  const prefix = picked.map((word) => word[0]!.toUpperCase()).join('');
  return prefix || 'SP';
}

// Highest existing number for the prefix plus one, e.g. next "MO-007".
async function nextNumber(strapi: any, prefix: string): Promise<number> {
  const rows = (await strapi.db.query(UID).findMany({ select: ['propertyCode'] })) as {
    propertyCode?: string | null;
  }[];
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const row of rows) {
    if (!row.propertyCode) continue;
    const match = String(row.propertyCode).match(re);
    if (match) {
      const value = Number(match[1]);
      if (value > max) max = value;
    }
  }
  return max + 1;
}

export default factories.createCoreService(UID, ({ strapi }) => ({
  async create(params) {
    const data = (params?.data ?? {}) as Record<string, unknown>;
    const provided = typeof data.propertyCode === 'string' ? data.propertyCode.trim() : '';
    if (!provided) {
      const prefix = codePrefix(data.building);
      data.propertyCode = `${prefix}-${String(await nextNumber(strapi, prefix)).padStart(3, '0')}`;
    }
    return super.create(params);
  },

  async update(id, params) {
    const data = (params?.data ?? {}) as Record<string, unknown>;
    // The code is auto-generated and not meant to be edited; an empty string
    // means "leave the existing code untouched".
    if (typeof data.propertyCode === 'string' && data.propertyCode.trim() === '') {
      delete data.propertyCode;
    }
    return super.update(id, params);
  },
}));