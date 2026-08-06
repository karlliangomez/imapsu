/**
 * map-label controller
 *
 * Building labels are the display names OAS assigns to buildings on the 3D
 * campus map. Each label is keyed to a building's identity in the GLB model
 * (`buildingKey`, the normalized node name) so the map renderer can look them
 * up without any manual footprint management. Read access is public; writes
 * are OAS-only through the permission matrix.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::map-label.map-label');
