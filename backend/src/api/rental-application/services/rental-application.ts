/**
 * rental-application service
 *
 * Submission requires a complete document set: a signed letter of intent,
 * DTI business documents, BIR business documents, business permits, and a
 * description of the products/services the applicant plans to offer.
 */

import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const { ApplicationError } = errors;

const DOCUMENT_REQUIREMENTS: Array<[string, string]> = [
  ['letterOfIntent', 'A signed letter of intent is required to submit a rental application.'],
  ['dtiDocuments', 'At least one DTI business document is required to submit a rental application.'],
  ['birDocuments', 'At least one BIR business document is required to submit a rental application.'],
  ['businessPermits', 'At least one business permit is required to submit a rental application.'],
];

export default factories.createCoreService('api::rental-application.rental-application', ({ strapi }) => ({
  async create(params) {
    const data = params?.data ?? {};

    for (const [field, message] of DOCUMENT_REQUIREMENTS) {
      const value = data[field];
      const present =
        field === 'letterOfIntent'
          ? Boolean(value)
          : Array.isArray(value) && value.length > 0;
      if (!present) {
        throw new ApplicationError(message);
      }
    }

    const products = typeof data.productsServices === 'string' ? data.productsServices.trim() : '';
    if (!products) {
      throw new ApplicationError('Please describe the products or services you plan to offer.');
    }

    return super.create(params);
  },
}));