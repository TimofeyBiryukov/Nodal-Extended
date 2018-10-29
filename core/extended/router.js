'use strict';

const Nodal = require('../module');
const fxn  = require('fxn');
const url = require('url');
const querystring = require('querystring');
const domain = require('domain'); // TODO: Will be deprecated

const utilities = fxn.utilities;
const StrongParam = fxn.StrongParam;
const ExecutionQueue = fxn.ExecutionQueue;

class Route {

  constructor(path, regex, names) {

    this.path = path;
    this.regex = regex;
    this.names = names;
    this.controller = null;
    this.customRoute = null;

  }

  match(path) {

    let match = path.match(this.regex);
    return match ? [].slice.call(match, 1) : null;

  }

  params(path) {

    let matches = this.match(path).map(v => v || '');
    return this.names.reduce((obj, name, i) => {
      obj[name] = matches[i];
      return obj;
    }, {});

  }

  use(controller, customRoute) {

    this.controller = controller;
    this.customRoute = customRoute;
    return this;

  }

}

class Router {

  constructor() {

    this._routes = [];
    this.middleware = new ExecutionQueue();
    this.renderware = new ExecutionQueue();

  }

  parsePath(requrl) {

    let urlData = url.parse(requrl, true);
    let path = urlData.pathname;
    if (path[path.length - 1] === '/') {
      path = path.substr(path, path.length - 1);
    }

    return path;

  }

  route(path) {

    let routeData = utilities.parseRegexFromString(path);
    let route = new Route(path, routeData.regex, routeData.names);
    this._routes.push(route);
    return route;

  }

  find(url) {

    let path = this.parsePath(url);
    let routes = this._routes;

    for (let i = 0, len = routes.length; i < len; i++) {
      let route = routes[i];
      if (route.match(path)) {
        return route;
      }
    }

    return null;

  }

  parseBody(body, headers) {

    let contentType = headers['content-type'];
    let contentData = (contentType || '').split(';').map(c => c.replace(/^\s*(.*)\s*$/, '$1'));

    contentType = contentData[0] || '';
    contentData = contentData.slice(1).reduce((data, content) => {
      content = content.split('=');
      content && (data[content[0]] = content[1]);
      return data;
    }, {});

    let fn = {
      'application/x-www-form-urlencoded': (body) => {
        return this.parseQueryParameters(querystring.parse(body.toString()));
      },
      'application/json': body => {
        try {
          return JSON.parse(body.toString());
        } catch(e) {
          console.log('Failed to parse JSON Body');
          return {};
        }
      },
      'multipart/form-data': body => {

        let data = {};
        body = body.toString('binary');

        let delim = contentData.boundary;
        let newLine = body.indexOf(delim + '\r\n') > -1 ? '\r\n' : '\n';

        let items = body.split(delim);

        // Eliminate top of array (empty).
        items.shift();

        return items
          .map(item => {
            item = item.split(newLine);
            item.shift();
            item.pop();
            return item;
          })
          .filter(item => item.length)
          .reduce((data, item) => {

            let contentDisposition;
            let contentType;

            if (item[0].match(/^content\-disposition/i)) {
              contentDisposition = item.shift().replace(/^\s*(.*)\s*$/, '$1');
            }

            if (item[0].match(/^content\-type/i)) {
              contentType = item.shift().replace(/^\s*(.*)\s*$/, '$1');
            }

            // Remove blank line...
            item.shift();

            let content = item.join(newLine);

            contentType = contentType && contentType.split(';')[0];
            contentType = contentType && contentType.split(':')[1].replace(/^\s*(.*)\s*$/, '$1');

            if (!contentDisposition) {
              throw new Error('Malformed Form Data');
            }

            let meta = contentDisposition.split(';')
              .slice(1)
              .reduce((meta, v) => {

                v = v.replace(/^\s*(.*)\s*$/, '$1').split('=');
                let name = v[0];
                let value = '';
                try {
                  value = JSON.parse(v[1]);
                } catch(e) {
                  value = '';
                }

                meta[name] = value;
                return meta;

              }, {});

            if (meta.name) {
              if (!contentType) {
                let buffer = new Buffer(content, 'binary');
                data[meta.name] = buffer.toString();
              } else {
                let buffer = new Buffer(content, 'binary');
                buffer.contentType = contentType;
                Object.keys(meta).forEach(key => buffer[key] = meta[key]);
                data[meta.name] = buffer;
              }
            }

            return data;

          }, {});

      }
    }[contentType];

    return fn ? fn.call(this, body) : {};

  }

  parseQueryParameters(query) {

    let obj = {};

    Object.keys(query).forEach(function(key) {

      let newKey, subKey;
      let value = query[key];
      let match = key.match(/(.*)\[(.*)\]$/);

      if (match) {

        newKey = match[1];
        subKey = match[2];

        if (subKey) {
          obj[newKey] = obj[newKey] || {};
          obj[newKey][subKey] = value;
          return;
        }

        value = !(value instanceof Array) ? [value] : value;

        obj[newKey] = value;
        return;

      }

      obj[key] = value;
      return;

    });

    return obj;

  }

  parseAuth(params, headers, body) {
    let auth = {};
    let cookies = this.parseCookies(headers);

    if (cookies.access_token) {
      auth.token_type = 'bearer';
      auth.access_token = cookies.access_token || '';
    } else if (headers['authorization']) {
      let parts = headers['authorization'].split(' ');
      if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
        auth.token_type = 'bearer';
        auth.access_token = parts[1];
      }
    } else if (params.access_token) {
      auth.token_type = 'bearer';
      auth.access_token = params.access_token || '';
    } else if (body.access_token) {
      auth.token_type = 'bearer';
      auth.access_token = body.access_token || '';
    }

    return auth;
  }

  /**
   * @param {{cookie: string}}headers
   * @return {Object}
   */
  parseCookies(headers) {
    let cookies = {};
    let rawCookies = headers.cookie;

    rawCookies && rawCookies.split(';').forEach((cookie) => {
      let parts = cookie.split('=');
      cookies[parts.shift().trim()] = decodeURI(parts.join('='));
    });

    return cookies;
  }

  prepare(ip, url, method, headers, body) {
    let path = this.parsePath(url);
    let route = this.find(url);
    body = body instanceof Buffer ? body : new Buffer(body + '');

    return {
      remoteAddress: ip,
      url,
      method,
      path,
      body,
      cookies: this.parseCookies(headers),
      controller: route.controller,
      customRoute: route.customRoute,
      headers: headers,
      matches: route.match(path),
      route: route.params(path)
    };

  }

  parseRemoteAddress(remoteAddress, list) {

    let remoteAddressList = remoteAddress.split(',').map(v => v.replace(/^\s*(.*?)\s*$/, '$1')).filter(v => v);
    return list ? remoteAddressList : remoteAddressList[0];

  }

  dispatch(routeData, responder) {

    let body = new StrongParam(this.parseBody(routeData.body, routeData.headers));

    let params = {
      buffer: new Buffer(routeData.body, 'binary'),
      query: new StrongParam(this.parseQueryParameters(url.parse(routeData.url, true).query)),
      body: body,
      path: routeData.path,
      auth: this.parseAuth(url.parse(routeData.url, true).query, routeData.headers, body),
      matches: routeData.matches,
      route: routeData.route,
      remoteAddress: this.parseRemoteAddress(routeData.headers['x-forwarded-for'] || routeData.remoteAddress),
      remoteAddressList: this.parseRemoteAddress(routeData.headers['x-forwarded-for'] || routeData.remoteAddress, true),
      id: routeData.route.id,
      cookies: routeData.cookies
    };

    let d = domain.create();

    d.on('error', responder);

    d.run(() => {

      const DispatchController = routeData.controller;

      let controller = new DispatchController(
        routeData.path,
        routeData.method,
        routeData.headers,
        params,
        responder
      );

      controller.middleware.prepend(this.middleware);
      controller.renderware.append(this.renderware);
      if (routeData.customRoute) controller.setCustomRoute(routeData.customRoute);

      controller.run();

      return controller;

    });

  }

}

module.exports = Router;
module.exports.Route = Route;
