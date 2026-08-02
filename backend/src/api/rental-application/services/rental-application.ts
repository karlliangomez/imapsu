/**
 * rental-application service
 */

import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const { ApplicationError } = errors;

export default factories.createCoreService('api::rental-application.rental-application', ({ strapi }) => ({
  async create(params) {
    if (!params?.data?.letterOfIntent) {
      throw new ApplicationError('A signed letter of intent is required to submit a rental application.');
    }
    return super.create(params);
  },
}));
