/**
 * Custom property-space routes
 *
 * The short `/properties` path is used by the frontend. Authentication is
 * required (unlike the original public route) so logged-out visitors cannot
 * browse property data.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/properties',
      handler: 'api::property-space.property-space.findProperties',
      config: {
        auth: {
          scope: ['api::property-space.property-space.find'],
        },
      },
    },
    {
      method: 'GET',
      path: '/properties/active-tenants',
      handler: 'api::property-space.property-space.findActiveTenants',
      config: {
        auth: {
          scope: ['api::property-space.property-space.find'],
        },
      },
    },
  ],
};
