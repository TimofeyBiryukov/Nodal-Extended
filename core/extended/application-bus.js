'use strict';


const Nodal = require('../module');

module.exports = function () {
  if (!global.__app) {
    global.__app = new Nodal.extended.Application('app', Nodal.my.Config);
  }
  return global.__app;
};
