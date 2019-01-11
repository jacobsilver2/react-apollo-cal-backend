const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeANiceEmail } = require('../mail');
const { hasPermission } = require('../utils');
const Mutations = {

  async createEventWithNewAct(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error ("You must be logged in to do that");
    }
    const event = await ctx.db.mutation.createEvent({
      data: {
        // this is how we create a relationship between the item and the user
        user: {
          connect: {
            id: ctx.request.userId
          },
        },
        title: args.title,
        start: args.start,
        end: args.end,
        notes: args.notes,
        act: {
          create: {
            name: args.name,
            email: args.email,
            description: args.description,
            image: args.image,
            largeImage: args.largeImage,
            user: {
              connect: {
                id: ctx.request.userId
              },
            },
          },
        },
      }
    }, info);
    return event;
  },

  async createEventWithExistingAct(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error ("You must be logged in to do that");
    }
    const event = await ctx.db.mutation.createEvent({
      data: {
        // this is how we create a relationship between the item and the user
        user: {
          connect: {
            id: ctx.request.userId
          },
        },
        title: args.title,
        start: args.start,
        end: args.end,
        allDay: args.allDay,
        notes: args.notes,
        act: {
          connect: {
            id: args.actId,
          },
        },
      }
    }, info);
    return event;
  },

  //! probably not needed
  updateEventWithExistingAct(parent, args, ctx, info) {
    const updates = { ...args }
    delete updates.id;
    return ctx.db.mutation.updateEvent({
      data: {
        where: {
          id: args.id
        },
        start: updates.start,
        notes: updates.notes,
        act: {
          disconnect: [
            {id: updates.oldActId},
          ],
          connect: [
            {id: updates.newActId},
          ],
        },
      },
    })
  },

  updateEvent(parent, args, ctx, info) {
    // take a copy of the updates
    const updates = { ...args };
    // remove the id from the updates
    delete updates.id;
    //run the update method

    //! apparently a new feature will be released soon with a 'set' function to replace a nested node.
    //! i will wait until that feature is implemented to fix this bug.

    if (updates.newActId) {
      return ctx.db.mutation.updateEvent({
        where: {
          id: args.id
        },
        data: {
          act: {
            disconnect: [
              {id: updates.actId},
            ],
            connect: [
              {id: updates.newActId}
            ],
          }
        }
      }, info)
    }

    return ctx.db.mutation.updateEvent({
      where: {
        id: args.id
      },
      data: {
        title: updates.title,
        start: updates.start,
        end: updates.end,
        allDay: updates.allDay,
        notes: updates.notes,
        act: {
          update: {
            name: updates.name,
            email: updates.email,
            description: updates.description,
            image: updates.image,
            largeImage: updates.largeImage,
          }
        },
      },
    }, info)
  },

  async createAct(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error ("You must be logged in to add an act.");
    }

    const act = await ctx.db.mutation.createAct({
      data: {
        // make a relationship between act and user
        user: {
          connect: {
            id: ctx.request.userId
          }
        },
        ...args
      }
    }, info);
    return act;
  },



  updateAct(parent, args, ctx, info){
    // take a copy of the updates
    const updates = { ...args };
    // remove the ID from the update
    delete updates.id;
    // run updateAct
    return ctx.db.mutation.updateAct({
      data: updates,
      where: {
        id: args.id
      }
    }, info)
  },

  async deleteEvent(parent, args, ctx, info) {
    const where = { id: args.id };
    // 1. Find the event
    const event = await ctx.db.query.event({ where }, `{ id user { id }}`);
    // 2. Check if they own that event, or have permissions
    const ownsEvent = event.user.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission => 
      ['ADMIN', 'EVENTDELETE'].includes(permission) 
    )
    if (!ownsEvent && !hasPermissions) {
      throw new Error ("You don't have permission to do that.")
    }
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

  async signin(parent, {email, password}, ctx, info) {
    //check if there is a user with that email
    const user = await ctx.db.query.user({ where: { email }})
    if(!user) {
      throw new Error(`No user found for email ${email}`);
    }
    //Check if their password is correct
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error ('Invalid password');
    }
    //Generate the JWT Token
    const token = jwt.sign({ userId: user.id}, process.env.APP_SECRET);
    // Set the cookie with the Token
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365
    });
    // Return the user
    return user;
  },
  signout( parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return { message: 'Goodbye!'};
  },
  
  async requestReset( parent, args, ctx, info ) {
    // check if this is a real user
    const user = await ctx.db.query.user({ where: { email: args.email }});
    if (!user) {
      throw new Error(`No user found for email ${args.email}`);
    }

    // set a reset token and expiry
    const randomBytesPromisified = promisify(randomBytes);
    const resetToken = (await randomBytesPromisified(20)).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; //1 hour from now
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry }
    });
    // console.log(res)
    // email them that reset token
    const mailRes = await transport.sendMail({
      from: 'jacobsilver2@mac.com',
      to: user.email,
      subject: 'Your password reset token',
      html: makeANiceEmail(`Your password reset Token is here!  \n\n 
      <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click Here To Reset</a>`)
    })

    // return the message
    return { message: "Thanks"};
  },
  async resetPassword(parent, args, ctx, info){
    // 1. Check if the passwords match
    if (args.password !== args.confirmPassword) {
        throw new Error('Passwords don\'t match bub');
    }
    // 2. Check if it's a legit reset token
    // 3. Check if it's expiried
    // steps 2 and 3 can be done in one step
    
    // querying for users instead of user gives us many more search options.
    // first we query for the reset token, second we make sure the expiry is within one hour
    const [user] = await ctx.db.query.users({
        where: {
            resetToken: args.resetToken,
            resetTokenExpiry_gte: Date.now() - 3600000
        },
    });
    if(!user){
        throw new Error('this token is either invalid or expired');
    }
    
    // 4. Hash their new passwords
    const password  = await bcrypt.hash(args.password, 10);

    // 5. Save the new password to the user and remove old reset token fields
    const updatedUser = await ctx.db.mutation.updateUser({
        where: {email: user.email},
        data: {
            password,
            resetToken: null,
            resetTokenExpiry: null
        },
    })
    // 6. Generate JWT
    const token = jwt.sign({ userId: updatedUser.id}, process.env.APP_SECRET);
    // 7.  Set the JWT Cookie
    ctx.response.cookie('token', token, {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 365
    })
    // 8. return the new User
    return updatedUser;
},
  async updatePermissions(parent, args, ctx, info) {
    // check if they are logged in
    if (!ctx.request.userId) {
      throw new Error('You Must Be Logged In.');
    }
    // query the current user
    const currentUser = await ctx.db.query.user({
      where: {
        id: ctx.request.userId,
      },
    }, info);
    // check if they have permisssions to do this
    hasPermission(currentUser, ['ADMIN', 'PERMISSIONUPDATE'])
    // update the permissions
    return ctx.db.mutation.updateUser({
      data: {
        permissions: {
          set: args.permissions,
        },
      },
      where: {
        id: args.userId
      },
    }, info);
  }

};

module.exports = Mutations;
