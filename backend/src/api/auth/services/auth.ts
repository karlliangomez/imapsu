/**
 * auth service
 */

export default {
  async findRoleByType(type: string) {
    return strapi.db.query('plugin::users-permissions.role').findOne({ where: { type } });
  },
};
