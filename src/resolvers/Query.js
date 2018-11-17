const { forwardTo } = require('prisma-binding');

const Query = {
  events: forwardTo('db'),

};

module.exports = Query;
