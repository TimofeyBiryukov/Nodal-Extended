
const Nodal = require('../module');
const SocketServer = Nodal.extended.SocketServer;

const http = require('http');
const fxn = require('fxn');


const utilities = fxn.utilities;


/**
 * Single HTTP Application. Logging and response functionality.
 * @class
 */
class Application {

  constructor(name, config = {}, slave = false) {

    /**
     * @type {String}
     */
    this.name = name || 'fxn';

    /**
     * @type {http.Server}
     */
    this.server = http.createServer(this.handler.bind(this));

    /**
     * @type {Nodal.Router}
     */
    this.router = require(`${process.cwd()}/app/router.js`);

    /**
     * @type {SocketIO.Server}
     */
    this.socketServer = new SocketServer(config, this.server, this.router);


    console.log(`[${this.name}.${process.pid}] Startup: Starting HTTP Worker`);

    process.on('uncaughtException', e => {
      if (slave) {
        process.send({
          error: {
            name: e.name,
            message: e.message,
            stack: e.stack
          }
        });
        process.exit(1);
      }
    });

    process.on('message', data => {
      data.invalidate && process.exit(0);
    });

    process.on('exit', (code) => {
      console.log(`[${this.name}.${process.pid}] Shutdown: Exited with code ${code}`);
    });

  }

  /**
   * Listens for incoming connections on a provided port
   * @param {Number} port
   */
  listen(port) {

    port = port || 3000;

    this.server.listen(port);
    console.log(`[${this.name}.${process.pid}] Ready: HTTP Worker listening on port ${port}`);
    if (process.send) process.send({message: 'ready'});
  }

  getTime() {

    let hrTime = process.hrtime();
    return (hrTime[0] * 1000 + hrTime[1] / 1000000);

  }

  /**
   * Logs a server response in the console
   * @param {Number} statusCode HTTP Status Code
   * @param {String} url The url that was hit
   * @param {String} t The time to execute the request
   */
  logResponse(statusCode, url, t, str) {

    let num = Math.floor(statusCode / 100);
    str = str || '';

    if (num === 2) {
      str = str || 'Request OK';
    } else if (num === 3) {
      str = str || 'Request Redirect';
    } else if (num === 4) {
      str = str || 'Request Error';
    } else if (num === 5) {
      str = str || 'Server Error';
    } else {
      str = str || 'Unknown';
    }

    console.log(`[${this.name}.${process.pid}] ${str} [${statusCode | 0}]: ${url} loaded in ${t} ms`);

  }

  /**
   * HTTP Request Handler
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   */
  handler(req, res) {
    let body = [];
    let bodyLength = 0;
    let maxSize = utilities.parseSize(process.env.MAX_UPLOAD_SIZE) || utilities.parseSize('20MB');
    let start = this.getTime();

    console.log(`[${this.name}.${process.pid}] Incoming Request: ${req.url} from ${req.connection.remoteAddress}`);

    let route = this.router.find(req.url);

    if (!route) {
      this.error(req, res, start, 404, 'Not Found');
      return;
    }

    req.on('data', data => {
      body.push(data);
      bodyLength += data.length;
      if (bodyLength > maxSize) {
        this.error(req, res, start, 413, 'Request Too Large');
        req.connection.destroy();
      }
    });

    req.on('end', () => {

      if (req.connection.destroyed) {
        return;
      }

      body = Buffer.concat(body);

      return this.router.dispatch(
        this.router.prepare(
          req.connection.remoteAddress,
          req.url,
          req.method,
          req.headers,
          body
        ),
        (err, status, headers, data) => {

          // handle preflight requests CORS
          if (req.method === 'OPTIONS') {
            headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
            headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
            headers['Access-Control-Allow-Credentials'] = 'true';
            headers['Access-Control-Allow-Origin'] = req.headers.origin;
          }

          let isStream = stream =>
            typeof stream === 'object' &&
            !!stream.pipe &&
            typeof stream.pipe === 'function';

          if (err) {
            this.error(req, res, start, 500, 'Internal Server Error', err);
          } else if (isStream(data)) {
            this.stream(req, res, start, status, headers, data, 'Stream START');
          } else {
            this.send(req, res, start, status, headers, data);
          }

        }
      );

    });

  }

  /**
   * HTTP Error
   */
  error(req, res, start, status, message, err) {

    status = status || 500;
    message = message || 'Internal Server Error';

    let headers = {'Content-Type': 'text/plain'};

    err && console.log(err.stack);

    this.send(req, res, start, status, headers, message + (err ? `\n${err.stack}` : ''), message);

  }

  /**
   * Ends the HTTP Response
   */
  send(req, res, start, status, headers, data, log) {

    res.writeHead(status, headers);
    res.end(data);

    this.logResponse(res.statusCode, req.url, (this.getTime() - start).toFixed(3), log);

  }

  stream(req, res, start, status, headers, dataStream, log) {

    res.writeHead(status, headers);
    dataStream.pipe(res);

    this.logResponse(res.statusCode, req.url, (this.getTime() - start).toFixed(3), log);
  }

}


module.exports = Application;
