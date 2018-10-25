

const Nodal = require('nodal');
const IO = require('socket.io');
const IOEmitter = require('socket.io-emitter');
const redis = require('socket.io-redis');


class SocketServer {
  /**
   * @param {http.Server} server
   * @param {Nodal.Router} router
   */
  constructor(server, router) {
    if (!Nodal.my.Config.sockets.enabled) {
      return;
    }

    /**
     * @type {SocketIO.Server}
     */
    this.io = new IO(server, Nodal.my.Config.sockets.options);

    /**
     *
     * @type {Nodal.Router}
     */
    this.router = router;


    /**
     * @type {Function}
     * @this {Socket}
     * @param {Object} data
     */
    let subscribe = function(data) {
      let room = SocketServer.getRoom(data.model, data.id);
      if (!this.rooms[room]) {
        console.log('SocketServer: subscribe: ' + room);
        this.join(room, () => {});
      }
    };

    /**
     * @type {Function}
     * @this {Socket}
     * @param {Object} data
     */
    let unsubscribe = function(data) {
      let room = SocketServer.getRoom(data.model, data.id);
      if (this.rooms[room]) {
        console.log('SocketServer: unsubscribe: ' + room);
        this.leave(room, () => {});
      }
    };

    this.io.on('connection', (socket) => {
      socket.on('req', (req) => {
        this.handler(socket, req);
      });
      socket.on('sub', subscribe);
      socket.on('subscribe', subscribe);
      socket.on('join', subscribe);
      socket.on('unsub', unsubscribe);
      socket.on('unsubscribe', unsubscribe);
      socket.on('leave', unsubscribe);
    });

    if (Nodal.my.Config.sockets.use_redis) {
      this.io.adapter(redis(Nodal.my.Config.db.redis));
      this.ioEmitter = new IOEmitter(Nodal.my.Config.db.redis);
    }
  }

  /**
   * Makes Controllers available through socket
   * by mimicking RESTFUL api
   * @param {SocketIO.Socket} socket
   * @param {Object} req
   */
  handler(socket, req) {
    let id = req.id || null;
    let body = new Buffer(JSON.stringify(req.body));

    if (!this.router.find(req.url)) {
      return socket.emit('res', {
        id,
        status: 404,
        body: 'Not Found'
      });
    }

    req.connection = {};
    req.connection.remoteAddress = 'http://localhost:8080'; // TODO:

    let request = this.router.prepare(
      req.connection.remoteAddress,
      req.url,
      req.method,
      req.headers,
      body
    );

    this.router
      .dispatch(request, (err, status, headers, data) => {
        if (err) {
          socket.emit('res', {
            id,
            status: 500,
            body: 'Internal Server Error'
          });
        } else {
          let JSONData = new Buffer(data).toString();
          JSONData = JSON.parse(JSONData);
          socket.emit('res', {
            id,
            status,
            headers,
            body: JSONData
          });
        }
      });
  }

  /**
   *
   * @param {String} model
   * @param {Number} id
   * @returns {string}
   */
  static getRoom(model, id) {
    let result = model.toLowerCase();

    if (id) {
      result += ':' + id.toString();
    }

    return result;
  }
}

module.exports = SocketServer;
