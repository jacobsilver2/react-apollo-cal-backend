const Mutations = {

  async createEvent(parent, args, ctx, info) {
    // TODO: check if they are logged in

    const event = await ctx.db.mutation.createEvent({
      data: {
        ...args
      }
    }, info);
    return event;
  },

  updateEvent(parent, args, ctx, info) {
    // take a copy of the updates
    const updates = { ...args };
    // remove the id from the updates
    delete updates.id;
    //run the update method
    return ctx.db.mutation.updateEvent({
      data: updates,
      where: {
        id: args.id
      }
    }, info)
  },

  async deleteEvent(parent, args, ctx, info) {
    const where = { id: args.id };
    // 1. Find the item
    const item = await ctx.db.query.event({ where }, `{ id title}`);
    // 2. Check if they own that item, or have permissions
    // TODO
    // 3. Delete the item
    return ctx.db.mutation.deleteEvent({ where }, info)
  }


};

module.exports = Mutations;
