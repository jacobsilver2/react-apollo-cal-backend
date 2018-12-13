const { forwardTo } = require('prisma-binding');
const { hasPermission } = require('../utils');

const Query = {
  events: forwardTo('db'),
  acts: forwardTo('db'),
  act: forwardTo('db'),
  event: forwardTo('db'),
  me(parent, args, ctx, info) {
    // check if there is a current user ID
    if (!ctx.request.userId) {
      return null;
    }
    return ctx.db.query.user({
      where: { id: ctx.request.userId}
    }, info)
  },
  
  async users(parent, args, ctx, info) {
    // check if they are logged in
    if (!ctx.request.userId) {
      throw new Error ("You Are Not Logged In");
    }
    // check if the user has permissions to query all the users
    hasPermission(ctx.request.user, ['ADMIN', 'PERMISSIONUPDATE']);
    // if they do, query all the users
    return ctx.db.query.users({}, info);
  }

};

module.exports = Query;
