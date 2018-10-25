'use strict';


const Nodal = require('nodal');
// const applicationFactory = Nodal.require('lib/core/application-factory.js'); // TODO
const applicationFactory = function() {
  module.exports = function () {
    if (!global.__app) {
      global.__app = new Nodal.ApplicationExtended();
    }
    return global.__app;
  };
};

let app = applicationFactory();
app.listen(Nodal.my.Config.secrets.port);
