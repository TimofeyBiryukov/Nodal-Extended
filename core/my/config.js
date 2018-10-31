'use strict';

// Load env anew every time config is loaded
const env = require('./../env.js')();

const fs = require('fs');
const path = require('path');
const dot = require('dot');

let config = {};

let varname = dot.templateSettings.varname;

dot.templateSettings.varname = 'env';

let dir = path.join(env.rootDirectory, 'config');
let configFiles = fs.readdirSync(dir);

const EXT = '.json';

function isMergeableObject(val) {
  var nonNullObject = val && typeof val === 'object';

  return nonNullObject
    && Object.prototype.toString.call(val) !== '[object RegExp]'
    && Object.prototype.toString.call(val) !== '[object Date]'
}

function emptyTarget(val) {
  return Array.isArray(val) ? [] : {}
}

function cloneIfNecessary(value, optionsArgument) {
  var clone = optionsArgument && optionsArgument.clone === true;
  return (clone && isMergeableObject(value)) ? deepmerge(emptyTarget(value), value, optionsArgument) : value
}

function defaultArrayMerge(target, source, optionsArgument) {
  var destination = target.slice();
  source.forEach(function(e, i) {
    if (typeof destination[i] === 'undefined') {
      destination[i] = cloneIfNecessary(e, optionsArgument)
    } else if (isMergeableObject(e)) {
      destination[i] = deepmerge(target[i], e, optionsArgument)
    } else if (target.indexOf(e) === -1) {
      destination.push(cloneIfNecessary(e, optionsArgument))
    }
  });
  return destination
}

function mergeObject(target, source, optionsArgument) {
  var destination = {};
  if (isMergeableObject(target)) {
    Object.keys(target).forEach(function (key) {
      destination[key] = cloneIfNecessary(target[key], optionsArgument)
    })
  }
  Object.keys(source).forEach(function (key) {
    if (!isMergeableObject(source[key]) || !target[key]) {
      destination[key] = cloneIfNecessary(source[key], optionsArgument)
    } else {
      destination[key] = deepmerge(target[key], source[key], optionsArgument)
    }
  });
  return destination
}

function deepmerge(target, source, optionsArgument) {
  var array = Array.isArray(source);
  var options = optionsArgument || { arrayMerge: defaultArrayMerge }
  var arrayMerge = options.arrayMerge || defaultArrayMerge

  if (array) {
    return Array.isArray(target) ? arrayMerge(target, source, optionsArgument) : cloneIfNecessary(source, optionsArgument)
  } else {
    return mergeObject(target, source, optionsArgument)
  }
}


let localConfig = {};
if (configFiles.indexOf('local.json') > -1) {
  try {
    localConfig = JSON.parse(fs.readFileSync(path.join(dir, 'local.json')));
  } catch (e) {
    throw new Error(`Could not parse "config/${filename}": Invalid JSON`);
  }
}

configFiles.filter(function(filename) {
  let name = path.basename(filename, EXT);
  return !config[name] && path.extname(filename) === EXT;
}).forEach(function(filename) {

  let name = path.basename(filename, EXT);
  let configData;

  try {
    configData = fs.readFileSync(path.join(dir, filename));
    configData = dot.template(configData)(process.env);
    configData = JSON.parse(configData);
  } catch(e) {
    throw new Error(`Could not parse "config/${filename}": Invalid JSON`);
  }

  if (localConfig[name] && localConfig[name][env.name]) {
    configData[env.name] = mergeObject(configData[env.name], localConfig[name][env.name]);
  }

  config[name] = configData[env.name];
});

config.local = localConfig;

dot.templateSettings.varname = varname;

module.exports = config;
