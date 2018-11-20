const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
  },
  
  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase();
    // hash their password
    const password = await bcrypt.hash(args.password, 10);
    // create the user in the database
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: ['USER'] }
        },
      }, 
      info
    );
    // create the JWT for them
    const token = jwt.sign({ userId: user.id}, process.env.APP_SECRET);
    // set the JWT as cookie on the response
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    });
    // return the user to the browser
    return user;
  },


};

module.exports = Mutations;
