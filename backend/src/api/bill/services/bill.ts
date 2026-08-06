/**
 * bill service
 *
 * Provides the core CRUD service plus a `markOverdueBills` maintenance helper
 * that flips past-due unpaid bills to the Overdue status. It is invoked by the
 * daily maintenance cron registered in src/index.ts.
 */

import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';

const UID = 'api::bill.bill';

export default factories.createCoreService(UID, ({ strapi }) => ({
  async markOverdueBills(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);

    const overdue = (await strapi.db.query(UID).findMany({
      where: {
        status: { $in: ['Unpaid', 'For Verification'] },
        dueDate: { $lt: today },
      },
      select: ['documentId'],
    })) as { documentId: string }[];

    for (const bill of overdue) {
      await strapi.db.query(UID).update({
        where: { documentId: bill.documentId },
        data: { status: 'Overdue' },
      });
    }

    return overdue.length;
  },
}));

export type BillService = Core.CoreAPI.Service.CollectionType & {
  markOverdueBills: () => Promise<number>;
};
