/**
 * property-space controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::property-space.property-space',
  ({ strapi }) => ({
    async findProperties(ctx) {
      return super.find(ctx);
    },
  })
);