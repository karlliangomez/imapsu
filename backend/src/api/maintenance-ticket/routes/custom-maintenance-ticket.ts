/**
 * maintenance-ticket custom router
 *
 * Tenant follow-ups on open tickets. Regular users are scoped to their own
 * tickets inside the controller; staff can follow up on any ticket.
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/maintenance-tickets/:id/follow-up',
      handler: 'api::maintenance-ticket.maintenance-ticket.followUp',
      config: {
        auth: {
          scope: ['api::maintenance-ticket.maintenance-ticket.followUp'],
        },
      },
    },
  ],
};
