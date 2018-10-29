

class SocketEvent {
  constructor(eventData) {
    /** @type {String} */
    this.action = eventData.action;

    /** @type {Object} */
    this.data = eventData.data || {};

    /** @type {Array} */
    this.changedFields = eventData.changedFields || [];

    /** @type {String} */
    this.model = eventData.modelName;

    /** @type {Number} */
    this.id = eventData.id;
  }
}

module.exports = SocketEvent;
