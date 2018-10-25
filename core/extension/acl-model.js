

const Nodal = require('nodal');
const ACL = require('acl');
const async = require('async');
const knex = require('knex');
const ACLKnex = require('acl-knex');

const ACLComposer = Nodal.require('./acl-composer.js');

let dbConfig = Nodal.my.Config.db.main;

// Replace main db config with local version if exits
if (
  process.env.NODE_ENV !== 'production' &&
  Nodal.my.Config.hasOwnProperty('local') &&
  Nodal.my.Config.local.hasOwnProperty('db') &&
  Nodal.my.Config.local.db.hasOwnProperty('main')
) {
  dbConfig = Nodal.my.Config.local.db.main;
}

let db = knex({
  client: 'postgres',
  connection: dbConfig
});
let aclKnex = new ACLKnex(db, 'postgres', 'acl_');
let acl = new ACL(aclKnex);

const READ = 'read';
const UPDATE = 'update';
const DESTROY = 'destroy';
const OWNER = [READ, UPDATE, DESTROY];
const ADMIN_ROLE = 'admin';

/**
 * Assign administrator roles to a user
 * config/admin.json - to configure admin account
 */
if (Nodal.my.Config.admin.user_id) {
  acl.addUserRoles(Nodal.my.Config.admin.user_id, ADMIN_ROLE, (err) => {
    if (err) throw err;
  });
}


/**
 * Access Control Model class as a mixin
 *
 * @constructor
 * @extends {Nodal.Model}
 *
 * @param {Nodal.Model} parent
 * @return {Nodal.Model}
 */
const ACLModel = (parent = Nodal.Model) => class extends parent {

  /**
   * childOf will set this ACLModel as child of another ACLModel
   * returned promise can set field to be checked and
   * different permissions for different actions to be checked
   * against parent
   *
   * ex: `Room.childOf(Flow).via('flow_id').permission('update');`
   *
   * @param {!ACLModel} parentACL
   * @return {Object}
   */
  static childOf(parentACL) {
    this.parent = parentACL;
    this.joinField = this.parent.prototype.schema.table + '_id';
    this.parentReadPermission = READ;
    this.parentCreatePermission = UPDATE;

    let promise = {
      /** @param {String} joinField */
      via: joinField => {
        this.joinField = joinField || this.joinField;
        return promise;
      },
      /** @param {String} permission */
      readPermission: permission => {
        this.parentReadPermission = permission || this.parentReadPermission;
        return promise;
      },
      /** @param {String} permission */
      createPermission: permission => {
        this.parentCreatePermission = permission || this.parentCreatePermission;
        return promise;
      }
    };

    return promise;
  }

  /**
   * @param {object} data
   * @param {function({Error} err, {Nodal.Model} model)} callback
   * @param {Model} user
   * @param {=Transaction} opt_txn
   */
  static create(data, callback, user, opt_txn) {
    if (!user) return callback(new Error('No Owner User Provided'));

    if (this.parent) {
      acl.isAllowed(
        user.get('id'),
        `${this.parent.prototype.schema.table}:${data[this.joinField]}`,
        this.parentCreatePermission,
        (err, allowed) => {
          if (err) return callback(new Error(err));
          if (!allowed) return callback(new Error('Access Forbidden'));
          this.super_create(data, callback, user, opt_txn);
        });
    } else {
      this.super_create(data, callback, user, opt_txn);
    }
  }

  /**
   * @param {object} data
   * @param {function({Error} err, {Nodal.Model} model)} callback
   * @param {Model} user
   * @param {=Transaction} opt_txn
   */
  static super_create(data, callback, user, opt_txn) {
    super.create(data, (err, model) => {
      if (err) return callback(err);
      acl.allow(
        [`user:${user.get('id')}`, ADMIN_ROLE],
        `${this.prototype.schema.table}:${model.get('id')}`,
        OWNER
      );
      acl.addUserRoles(user.get('id'), `user:${user.get('id')}`);
      callback(err, model);
    }, opt_txn);
  }

  /**
   * @param {number} id
   * @param {object} data
   * @param {function({Error} err, {Nodal.Model} model)} callback
   * @param {Model} user
   */
  static update(id, data, callback, user) {
    this.find(id, (err, model) => {
      if (err) return callback(err);
      model.read(data);
      model.save(callback, user);
    }, user);
  }

  /**
   * @param {function} callback
   * @param {Model} user
   */
  save(callback, user) {
    if (this._inStorage) { // update existing
      this._checkAllowedPermission(UPDATE, err => {
        if (err) return callback(err);
        super.save(callback);
      }, user);
    } else { // create new
      super.save(callback);
    }
  }

  /**
   * @param {number} id
   * @param {function({Error} err, {Nodal.Model} model)} callback
   * @param {Model} user
   */
  static destroy(id, callback, user) {
    this.find(id, (err, model) => {
      if (err) return callback(err);
      model.destroy(callback, user);
    }, user);
  }

  /**
   * @param {function} callback
   * @param {Model} user
   */
  destroy(callback, user) {
    this._checkAllowedPermission(UPDATE, err => {
      if (err) return callback(err);
      super.destroy(callback);
    }, user);
  }

  _checkAllowedPermission(permission, callback, user) {
    let resource = `${this._table}:${this.get('id')}`;

    async.parallel([
      callback => acl.isAllowed(user.get('id'), resource, permission, callback),
      callback => {
        let tasks = [];
        user._groups.forEach(group => {
          tasks.push(cb => {
            acl.isAllowed(`group${group.get('id')}`, resource, permission, cb);
          });
        });
        async.parallel(tasks, (err, groupsAccess) => {
          if (err) return callback(err);
          let allowed = false;
          groupsAccess.forEach(groupAccess => {
            if (groupAccess) allowed = true;
          });
          callback(null, allowed);
        });
      }
    ], (err, allowedList) => {
      if (err) return callback(new Error(err));
      let allowed = false;
      allowedList.forEach(_allowed => {
        if (!allowed && _allowed) allowed = true;
      });
      if (!allowed) return callback(new Error('Access Forbidden'));
      callback(null, allowed);
    });
  }

  /**
   * @param {Model} user
   */
  static query(user) {
    return new ACLComposer(
      this,
      null,
      user,
      acl,
      this.parent,
      this.joinField,
      this.parentReadPermission
    );
  }

  /**
   * @param {number} id
   * @param {function({Error} err, {Nodal.Model} model)} callback
   * @param {Nodal.Model} user
   */
  static find(id, callback, user) {
    return new ACLComposer(
      this,
      null,
      user,
      acl,
      this.parent,
      this.joinField,
      this.parentReadPermission
    )
      .where({id: id})
      .end((err, models) => {
        if (!err && !models.length) {
          let err = new Error(`Could not find ${this.name} with id "${id}".`);
          err.notFound = true;
          return callback(err);
        }
        callback(err, models[0]);
      });
  }

  /**
   * @param {string} field
   * @param {any} value
   * @param {function({Error} err, {Nodal.Model} model)} callback
   * @param {Nodal.Model} user
   */
  static findBy(field, value, callback, user) {
    let query = {};
    query[field] = value;

    return new ACLComposer(
      this,
      null,
      user,
      acl,
      this.parent,
      this.joinField,
      this.parentReadPermission
    )
      .where(query)
      .end((err, models) => {
        if (!err && !models.length) {
          let err = new Error(`Could not find ${this.name} with ${field} "${value}".`);
          err.notFound = true;
          return callback(err);
        }
        callback(err, models[0]);
      });
  }

  /**
   *
   * @param {String|Number} modelID
   * @param {function(err, list)} callback
   */
  static userAccessRedis(modelID, callback) {
    let query = `_acl__allows_${this.prototype.schema.table}:${modelID}@*`;

    redisClient.keys(query, (err, keys) => {
      if (err) return callback(err);

      let tasks = [];

      keys.forEach((key) => {
        if (key.indexOf('user') === -1) return;
        tasks.push((cb) => {
          let dataEntry = {};
          dataEntry['user_id'] = Number(key.match(/\d+/g)[1]);
          redisClient.sscan(key, 0, (err, permissions) => {
            if (err) return cb(err);
            dataEntry['permissions'] = permissions[1];
            cb(null, dataEntry);
          });
        });
      });

      async.parallel(tasks, (err, data) => {
        callback(err, data);
      });
    });
  }

  /**
   *
   * @param {String|Number} modelID
   * @param {function(err, list)} callback
   */
  static userAccess(modelID, callback) {
    db.select('*')
      .from('acl_permissions')
      .where({
        key: `allows_${this.prototype.schema.table}:${modelID}`
      })
      .then((collection) => {
        let data = [];

        for (let key in collection[0].value) {
          if (collection[0].value.hasOwnProperty(key) && key !== ADMIN_ROLE) {
            data.push({
              id: Number(key.match(/\d+/g)[0]),
              type: key.match(/\w+/)[0],
              permissions: collection[0].value[key]
            });
          }
        }

        callback(null, data);
      })
      .catch(err => callback(err));
  }

  /**
   *
   * @param {function} cb
   * @param {Nodal.Model} user
   */
  allowedPermissions(cb, user) {
    let resource = `${this._table}:${this.get('id')}`;
    let permissions = [];
    let tasks = [];

    user._groups.forEach(group => {
      tasks.push(cb => {
        acl.allowedPermissions(
          `group${group.get('id')}`,
          resource,
          (err, data) => cb(err, data[resource])
        );
      });
    });

    tasks.push(cb => {
      acl.allowedPermissions(
        user.get('id'),
        resource,
        (err, data) => cb(err, data[resource])
      );
    });

    async.parallel(tasks, (err, data) => {
      if (err) return cb(err);

      data.forEach(_permissions => {
        _permissions.forEach(permission => {
          if (permissions.indexOf(permission) < 0) {
            permissions.push(permission);
          }
        });
      });

      cb(null, permissions);
    });

  }

  /**
   *
   * @param {Nodal.Model} owner this owner
   * @param {Nodal.Model} model model to give access to
   * @param {Array.<string>} permissions
   * @param {function} callback
   * @param {string?} opt_type
   */
  share(owner, model, permissions = [READ], callback = function() {}, opt_type) {
    if (typeof callback === 'string') {
      opt_type = callback;
    }

    if (typeof permissions === 'function') {
      callback = permissions;
      permissions = [];
    }

    if (
      !owner || !model ||
      !owner instanceof Nodal.Model || !model instanceof Nodal.Model
    ) {
      return callback(new Error('Must provide object owner & model'));
    }

    acl.isAllowed(owner.get('id'),
      `${this.schema.table}:${this.get('id')}`, OWNER, (err, allowed) => {
        if (err) return callback(new Error(err));
        if (!allowed) return callback(new Error('Access Forbidden'));
        if (permissions.indexOf(READ) < 0) permissions.push(READ);
        acl.allow(
          `${opt_type || 'user'}:${model.get('id')}`,
          `${this.schema.table}:${this.get('id')}`,
          permissions
        );
        if (model._table === 'groups') {
          // key must be different for groups
          acl.addUserRoles(`group${model.get('id')}`,
            `${opt_type || 'user'}:${model.get('id')}`);
        } else {
          acl.addUserRoles(model.get('id'),
            `${opt_type || 'user'}:${model.get('id')}`);
        }
        callback(err, allowed);
      });
  }

  /**
   *
   * @param {Model} owner this owner
   * @param {Model} model model to give access to
   * @param {=function} opt_callback
   * @param {=string} opt_type
   */
  unshare(owner, model, opt_callback, opt_type) {
    let callback = opt_callback || function() {};
    let resource = `${this.schema.table}:${this.get('id')}`;

    let type = opt_type;

    if (typeof opt_callback === 'string') {
      type = opt_callback;
    }

    let ownerID = owner.get('id');
    let modelID = model.get('id');

    if (owner._table === 'groups') ownerID = `group${ownerID}`;
    if (model._table === 'groups') modelID = `group${modelID}`;

    async.parallel([
      (cb) => acl.isAllowed(ownerID, resource, OWNER, cb),
      (cb) => acl.isAllowed(modelID, resource, READ, cb)
    ], (err, allowedList) => {
      if (err) return callback(new Error(err));

      let allowed = true;

      allowedList.forEach((allowedItem) => {
        if (!allowedItem) allowed = false;
      });

      if (!allowed) return callback(new Error('Access Forbidden'));

      acl.removeAllow(`${type || 'user'}:${model.get('id')}`, resource, OWNER, callback);
    });
  }
};

module.exports = ACLModel;
