const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeANiceEmail } = require('../mail');

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

};

module.exports = Mutations;
