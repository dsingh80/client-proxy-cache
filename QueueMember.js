'use strict';

/**
 * @class QueueMember
 * @param {Object} data - {method, params, callback}
 * @classdesc
 * Pushed onto a Queue.
 * The Queue will simply call QueueMember.process() and is unaware of how the data is handled.
 * This class is used to decouple processing logic away from the Queue itself.
 */
class QueueMember {

  constructor(data) {
    if (!data) {
      throw new Error('Attempt to initialize QueueMember without any data. Make sure every queued request is formatted properly');
    }
    this.method = data.method;
    this.params = data.params;
    this.callback = data.callback;
  }


  /**
   * @method process
   * @description Called by the queue when it's ready to process Handles logic for what to do with the data
   */
  process() {
    this.method(...this.params, this.callback);
  }

}


module.exports = QueueMember;