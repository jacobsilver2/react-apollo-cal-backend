const { forwardTo } = require('prisma-binding');

const Query = {
  events: forwardTo('db'),
  event: forwardTo('db'),
};

module.exports = Query;
