'use strict';


const Nodal = require('nodal');

let app = Nodal.extended.ApplicationBus();
app.listen(Nodal.my.Config.secrets.port);
