

const Nodal = require('../module');
const SocketEvent = require('./socket-event');
const applicationBus = require('./application-bus');

class PublisherModel extends Nodal.Model {
  constructor() {
    super(...arguments);
    this.setName();

    /**
     *
     * @type {Array}
     */
    this.__joinedPublishers = PublisherModel.joinedPublishers;
  }

  /**
   *
   * @param {String} name
   */
  setName(name = this.schema.table) {
    this.name = name;
  }

  /**
   *
   * @param {Nodal.Model} Model
   * @param {object} options
   */
  static joinsTo(Model, options) {
    if (new Model() instanceof PublisherModel && options.via) {
      PublisherModel.joinedPublishers.push({
        Model,
        via: options.via
      });
    }
    super.joinsTo(Model, options);
  }

  /**
   *
   * @param {Function} cb
   */
  save(cb) {
    let action = 'update';
    let changedFields = this.changedFields();

    if (this.toObject().id === null) {
      action = 'create';
    }

    super.save((err, model) => {
      if (!err && changedFields.length > 0) {
        this.__sendEvent({
          action: action,
          data: model.toObject(),
          changedFields
        });
      }
      cb(err, model, changedFields);
    });
  }

  /**
   *
   * @param {function} cb
   */
  destroy(cb) {
    super.destroy((err, model) => {
      if (!err) {
        this.__sendEvent({
          action: 'destroy',
          data: model.toObject()
        });
      }
      cb(err, model);
    });
  }

  /**
   *
   * @param {PublisherModel} joinedModel
   */
  add(joinedModel) {
    this.__sendEvent({
      action: 'add',
      data: {
        add_data: joinedModel.toObject(),
        add_id: joinedModel.get('id'),
        add_model: joinedModel.name
      }
    });
  }

  /**
   *
   * @param {PublisherModel} joinedModel
   */
  remove(joinedModel) {
    this.__sendEvent({
      action: 'remove',
      data: {
        add_id: joinedModel.get('id'),
        add_data: joinedModel.toObject(),
        add_model: joinedModel.name
      }
    });
  }

  /**
   *
   * @param {SocketEvent} eventData
   * @private
   */
  __sendEvent(eventData) {
    if (!Nodal.my.Config.sockets.enabled) {
      return;
    }

    let socketServer = applicationBus().socketServer;
    let room = this.roomName || this.name;
    let id = this.get('id');

    eventData['modelName'] = this.name;
    eventData['id'] = id;

    let socketEvent = new SocketEvent(eventData);

    if (eventData.action !== 'add' && eventData.action !== 'remove') {
      PublisherModel.__emit(socketServer.io, room, this.name, socketEvent);
      PublisherModel.__emit(socketServer.ioEmitter, room, this.name, socketEvent);
    }
    PublisherModel.__emit(socketServer.io, room + ':' + id, this.name, socketEvent);
    PublisherModel.__emit(socketServer.ioEmitter, room + ':' + id, this.name, socketEvent);
  }

  /**
   *
   * @param {IO} io
   * @param {String} room
   * @param {String} name
   * @param {Object} event
   */
  static __emit(io, room, name, event) {
    if (io) {
      console.log(
        'Publisher: to: ' + room +
        ', event: ' + name +
        ', data: ' + JSON.stringify(event));
      io.to(room).emit(name, event);
    }
  }
}

PublisherModel.joinedPublishers = [];

module.exports = PublisherModel;
