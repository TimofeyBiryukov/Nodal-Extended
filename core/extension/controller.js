

const Nodal = require('../module');
const API = Nodal.require('node_modules/nodal/core/required/api.js');


class Controller extends Nodal.Controller {

  constructor(path, method, requestHeaders, params, responder, customRoute) {
    super(path, method, requestHeaders, params, responder);
    this.customRoute = customRoute || '';
  }

  respondOne(data, arrInterface) {
    if (data instanceof Error) {
      if (data.notFound) {
        return this.notFound(data.message, data.details);
      }
      return this.badRequest(data.message, data.details);
    }

    this.render({data: API.format(data, arrInterface).data[0]});
    return true;
  }

  respondPlain() {
    return this.respondOne.apply(this, arguments);
  }

  respondRaw(data) {
    return this.render(data);
  }

  respondStream(dataStream) {
    if (dataStream instanceof Error) {
      this.setHeader('Content-Type', 'application/json');
      if (dataStream.notFound) {
        this.notFound(dataStream.message, dataStream.details);
      } else {
        this.badRequest(dataStream.message, dataStream.details);
      }
    } else {
      this._responder(null, 200, this._headers, dataStream);
    }
  }

  setCustomRoute(name) {
    this.customRoute = name;
  }

  run() {
    this.before();
    this.middleware.exec(this, (err) => {
      if (err) {
        return this.error(err.message);
      }

      if (this.customRoute && this[this.customRoute]) {
        this[this.customRoute](); // binded to a specific custom route
      } else {
        this[this.convertMethod(this._method, this.params.id)](); // binds to standart method functions
      }
    });
  }

  /**
   * Add a value to a existing specific response header. If header not exists create it.
   * @param {String} key
   * @param {String} value
   */
  appendHeader(key, value) {
    key = this._parseHeaderKey(key);
    let removeWhitespace = v => v.replace(/^\s*(.*)\s*$/, '$1');
    let values = (this._headers[key] || '').split(';').map(removeWhitespace);
    values[0] = values[0].split(',').map(removeWhitespace);
    values[0].indexOf(value) === -1 && values[0].push(value);
    if (!values[0][0]) values[0].shift();
    values[0] = values[0].join(', ');
    return (this._headers[key] = values.join('; '));
  }

}


module.exports = Controller;
