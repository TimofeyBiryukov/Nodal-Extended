

const Nodal = require('nodal');
const async = require('async');

const Composer = Nodal.require('node_modules/nodal/core/required/composer.js');
const ModelArray = Nodal.require('node_modules/nodal/core/required/model_array.js');


class ACLComposer extends Composer {
  /**
   * @param {Nodal.Model} Model
   * @param {Composer} parent
   * @param {Nodal.Model} user
   * @param {ACL} acl
   * @param {Nodal.Model=} opt_pRoutingnModel
   * @param {string=} opt_pRoutingField
   * @param {string=} opt_pRoutingPermission
   */
  constructor(
    Model,
    parent,
    user,
    acl,
    opt_pRoutingnModel,
    opt_pRoutingField,
    opt_pRoutingPermission
  ) {
    super(Model, parent);
    this.__user = user;
    this.__acl = acl;

    this.__pRoutingModel = opt_pRoutingnModel || null;
    this.__pRoutingField = opt_pRoutingField || null;
    this.__pRoutingPermission = opt_pRoutingPermission || null;

    if (parent) {
      this.__user = user || parent.__user;
      this.__acl = acl || parent.__acl;
      this.__pRoutingModel = opt_pRoutingnModel || parent.__pRoutingModel || null;
      this.__pRoutingField = opt_pRoutingField || parent.__pRoutingField || null;
      this.__pRoutingPermission = opt_pRoutingPermission || parent.__pRoutingPermission || null;
    }

  }

  __endProcessorACL__(models, offset, total, callback) {
    let tasks = [];

    let removeModel = (model) => {
      let remModel = models.find((m) => m.get('id') === model.get('id'));
      models.splice(models.indexOf(remModel), 1);
    };

    if (models.length > 0) ModelArray.from(models).forEach(model => {
      let modelName = model.schema.table;
      let modelID = this.__pRoutingField ? model.get(this.__pRoutingField) : model.get('id');
      let permission = this.__pRoutingPermission || 'read';

      if (this.__pRoutingModel) {
        modelName = this.__pRoutingModel.prototype.schema.table;
      }

      if (model.get('public')) {
        return undefined;
      } else if (!this.__pRoutingModel && !this.__user) {
        // model has no parent is not public and didn't pass a user
        return removeModel(model);
      }

      tasks.push((cb) => {

        let aclCheckCallback = (err, allowed) => {
          if (err) return cb(err);
          if (!allowed) removeModel(model);
          cb();
        };

        /**
         * figure out if there is parent with ID
         * check if that parent is public
         * or just check model or parent model permissions
         */
        if (this.__pRoutingModel && modelID) {
          this.__pRoutingModel.find(modelID, (err, pModel) => {
            if (err) return cb(err);
            if (pModel.get('public')) {
              cb();
            } else {
              this.__aclCheck(modelName, modelID, permission, aclCheckCallback);
            }
          }, this.__user);
        } else {
          this.__aclCheck(modelName, modelID, permission, aclCheckCallback);
        }

      });
    });

    async.series(tasks, (err) => {
      models.setMeta({offset: offset, total: total});
      callback.call(this, err, models);
    });
  }

  /**
   * Checks if user has access to a modelName+modeID
   * with permissions
   * Checks both if user got access or
   * if group that user is in has access
   *
   * @param {String} modelName
   * @param {String|Number} modelID
   * @param {array} permission
   * @param {Function} callback
   */
  __aclCheck(modelName, modelID, permission, callback = () => {}) {
    async.parallel({
      allowed_user: (cb) => {
        this.__acl.isAllowed(this.__user.get('id'),
          `${modelName}:${modelID}`, permission, (err, allowed) => {
            cb(err, allowed)
          });
      },
      allowed_group: (cb) => {
        let gAllowed = false;
        let tasks = [];

        if (this.__user._groups && this.__user._groups.length > 0) {
          this.__user._groups.forEach(group => {
            tasks.push(cb => {
              if (!gAllowed) {
                this.__acl.isAllowed(`group${group.get('id')}`,
                  `${modelName}:${modelID}`, permission, (err, allowed) => {
                    if (err) return cb(err);
                    if (!gAllowed) gAllowed = allowed || false;
                    cb();
                  });
              }
            });
          });
        }

        async.parallel(tasks, err => {
          cb(err, gAllowed);
        });
      }
    }, (err, data) => {
      callback(err, (data.allowed_user || data.allowed_group));
    });
  }

  /**
   * @param {Object} comparisonsArray Comparisons object. {age__lte: 27}, for example.
   */
  where(comparisonsArray) {

    if (!(comparisonsArray instanceof Array)) {
      comparisonsArray = [].slice.call(arguments);
    }

    comparisonsArray = comparisonsArray.map(comparisons => {
      return Object.keys(comparisons).reduce((p, c) => { return (p[c] = comparisons[c], p); }, {});
    });

    let order = null;
    let offset = null;
    let count = null;

    comparisonsArray.forEach(comparisons => {

      if ('__order' in comparisons) {
        order = comparisons.__order.split(' ');
        delete comparisons.__order;
      }

      if ('__offset' in comparisons || '__count' in comparisons) {
        offset = comparisons.__offset;
        count = comparisons.__count;
        delete comparisons.__offset;
        delete comparisons.__count;
      }

    });

    if (order || offset || count) {
      let composer = this;
      order && (composer = composer.orderBy(order[0], order[1]));
      (offset || count) && (composer = composer.limit(offset || 0, count || 0));
      return composer.where(comparisonsArray);
    }

    this._command = {
      type: 'where',
      data: {
        comparisons: comparisonsArray
          .map(comparisons => this.__parseComparisons__(comparisons))
          .filter(f => f.length)
      }
    };

    return new ACLComposer(this.Model, this);

  }

  /**
   * @param {string} field Field to order by
   * @param {string} direction Must be 'ASC' or 'DESC'
   */
  orderBy(field, direction) {

    let transformation;
    let fields = [];

    if (typeof field === 'function') {
      fields = utilities.getFunctionParameters(field);
      transformation = field;
    } else {
      fields = [field];
      transformation = v => `${v}`;
    }

    this._command = {
      type: 'orderBy',
      data: {
        columnNames: fields,
        transformation: transformation,
        direction: ({'asc': 'ASC', 'desc': 'DESC'}[(direction + '').toLowerCase()] || 'ASC')
      }
    };

    return new ACLComposer(this.Model, this);

  }

  /**
   * Join in a relationship.
   * @param {string} joinName The name of the joined relationship
   * @param {array} comparisonsArray comparisons to perform on this join (can be overloaded)
   */
  join(joinName, comparisonsArray, orderBy, count, offset) {

    // FIXME: validate orderBy
    orderBy = orderBy || '';
    count = Math.max(0, count | 0);
    offset = Math.max(0, offset | 0);

    if (!(comparisonsArray instanceof Array)) {
      comparisonsArray = [].slice.call(arguments, 1);
    }

    let relationship = this.Model.relationships().findExplicit(joinName);
    if (!relationship) {
      throw new Error(`Model ${this.Model.name} does not have relationship "${joinName}".`);
    }

    let composer = this;
    while (composer) {
      if (composer._command && composer._command.type === 'join' && composer._command.data.name === joinName) {
        return this;
      }
      composer = composer._parent;
    }

    let joinData = relationship.joins();
    joinData[joinData.length - 1].joinAlias = joinName;
    joinData[joinData.length - 1].prevAlias = joinName.split('__').slice(0, -1).join('__');
    joinData[joinData.length - 1].multiFilter = this.db.adapter.createMultiFilter(
      joinName,
      comparisonsArray
        .map(comparisons => this.__parseComparisons__(comparisons, relationship.getModel()))
        .filter(f => f.length)
    );

    // FIXME: implement properly
    joinData[joinData.length - 1].orderBy = orderBy;
    joinData[joinData.length - 1].offset = offset;
    joinData[joinData.length - 1].count = count;

    this._command = {
      type: 'join',
      data: {
        name: joinName,
        joinData: joinData
      }
    };

    return new ACLComposer(this.Model, this);
  }

  /**
   * Limit to an offset and count
   * @param {number} offset The offset at which to set the limit. If this is the only argument provided, it will be the count instead.
   * @param {number} count The number of results to be returned. Can be omitted, and if omitted, first argument is used for count.
   * @return {Nodal.Composer} new Composer instance
   */
  limit(offset, count) {

    if (this._command) {
      return new Composer(this.Model, this).limit(offset, count);
    }

    if (count === undefined) {
      count = offset;
      offset = 0;
    }

    count = parseInt(count);
    offset = parseInt(offset);

    this._command = {
      type: 'limit',
      data: {
        count: count,
        offset: offset
      }
    };

    return new ACLComposer(this.Model, this);

  }

  /**
   * Processes results and errors from a terminal call
   */
  __endProcessor__(err, r, callback) {

    if (!r || !r.countResult || !r.result) {
      throw new Error('End Query Expects object containing "count" and "results"');
    }

    let limitCommand = this.__getLastLimitCommand__(this.__collapse__());
    let offset = limitCommand ? limitCommand._command.data.offset : 0;

    let total = (((r.countResult && r.countResult.rows) || [])[0] || {}).__total__ || 0;
    let rows = r.result ? (r.result.rows || []).slice() : [];
    let models = this.__parseModelsFromRows__(rows, this.__isGrouped__());

    if (r.updateResult && r.updateResult.rows) {

      let cache = r.updateResult.rows.reduce((cache, obj) => {
        cache[obj.id] = obj;
        return cache;
      }, {});

      models.forEach(m => {
        let data = cache[m.get('id')];
        data && m.read(data);
      });

    }

    this.__endProcessorACL__(models, offset, total, callback);
  }

}

module.exports = ACLComposer;
