'use strict';

/**
 * @class Queue
 * @classdesc
 * A queue that will be processed continuously. The queue can be updated continually and will be processed in FIFO order;
 * The queue itself is maintained in reverse order (the first object is at the end). This makes it easier to call pop instead of the expensive shift() operation
 */
class Queue {

  constructor(data, shouldAutoProcess) {
    this.queue = [];
    this.processing = false;
    this.shouldAutoProcess = shouldAutoProcess;

    if (data) {
      if (data.length) { // data may be a collection of queue members
        data.forEach((queueObj) => {
          this.unshift(queueObj);
        });
      }
      else { // or data may be an individual queue member
        this.push(data);
      }
    }
  }


  /**
   * @method push
   * @param queueMember - a QueueMember object to add to the Queue
   * @description Adds an item to the queue. Will trigger processing of the queue if not already active
   */
  push(queueMember) {
    this.queue.unshift(queueMember);
    if(this.shouldAutoProcess) { this.__startProcessing(); }
  }


  start() {
    this.__startProcessing();
  }

  set autoProcess(val) {
    this.shouldAutoProcess = true && val; // enforce boolean
  }


  /**
   * @private
   * @method startProcessing
   * @description
   * SHOULD NEVER BE CALLED OUTSIDE OF THE CLASS.
   * This method will tell the queue to start processing items in the queue. Until the queue is empty, processing will continue.
   */
  __startProcessing() {
    if (this.processing) return true;
    while (this.queue.length > 0) {
      this.queue.pop().process();
    }
    this.processing = false;
    return false;
  }

}


module.exports = Queue;