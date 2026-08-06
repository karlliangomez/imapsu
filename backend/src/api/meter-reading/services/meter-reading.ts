/**
 * meter-reading service
 *
 * Provides the core CRUD service plus a `latestForTenancy` helper that the
 * bill controller uses to pre-fill utility meter readings when a new bill is
 * issued for a tenancy with an existing reading history. The helper returns
 * both the most recent reading (used as the bill's "current" meter value) and
 * the reading before it (used as the "previous" value, so consumption is the
 * difference between two recorded readings).
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';

const UID = 'api::meter-reading.meter-reading';

type ReadingRow = {
  electricMeterReading: number | null;
  waterMeterReading: number | null;
  readingDate: string | null;
};

export default factories.createCoreService(UID, ({ strapi }) => ({
  async latestForTenancy(
    tenancyRef: string | number | { documentId?: string; id?: number } | null | undefined
  ): Promise<{
    electricMeterReading: number | null;
    waterMeterReading: number | null;
    readingDate: string | null;
    previousElectricMeterReading: number | null;
    previousWaterMeterReading: number | null;
    previousReadingDate: string | null;
  } | null> {
    if (!tenancyRef) {
      return null;
    }

    const tenancyDocId =
      typeof tenancyRef === 'string'
        ? tenancyRef
        : tenancyRef && typeof tenancyRef === 'object'
          ? (tenancyRef as { documentId?: string }).documentId
          : undefined;

    const docId = tenancyDocId ?? String(tenancyRef);

    try {
      const rows = (await strapi.db.query(UID).findMany({
        where: { tenancy: { documentId: docId } },
        orderBy: { readingDate: 'desc' },
        select: ['electricMeterReading', 'waterMeterReading', 'readingDate'],
        limit: 2,
      })) as ReadingRow[];

      const latest = rows[0];
      if (!latest) {
        return null;
      }

      const previous = rows[1];
      return {
        electricMeterReading: latest.electricMeterReading,
        waterMeterReading: latest.waterMeterReading,
        readingDate: latest.readingDate,
        previousElectricMeterReading: previous?.electricMeterReading ?? null,
        previousWaterMeterReading: previous?.waterMeterReading ?? null,
        previousReadingDate: previous?.readingDate ?? null,
      };
    } catch {
      return null;
    }
  },
}));

export type MeterReadingService = Core.CoreAPI.Service.CollectionType & {
  latestForTenancy: (
    tenancyRef: unknown
  ) => Promise<{
    electricMeterReading: number | null;
    waterMeterReading: number | null;
    readingDate: string | null;
    previousElectricMeterReading: number | null;
    previousWaterMeterReading: number | null;
    previousReadingDate: string | null;
  } | null>;
};
