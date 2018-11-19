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
  }


};

module.exports = Mutations;
