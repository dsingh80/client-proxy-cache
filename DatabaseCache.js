'use strict';

require('dotenv').config();

const Cache = require('./Cache'),
  Queue = require('./Queue'),
  QueueMember = require('./QueueMember'),
  mongoose = require('mongoose');
const {Schema} = require('mongoose');


const CacheResourceSchema = new mongoose.Schema({
  resourceId: {
    type: String,
    required: true,
    editable: true,
    unique: true,
    trim: true
  },
  data: {
    type: Schema.Types.Mixed,
    required: true,
    editable: true
  },
  expiresAt: {
    type: Number,
    required: true,
    editable: true
  },
  lastAccessed: {
    type: Date,
    required: true,
    editable: true,
    default: new Date()
  }
});


class DatabaseCache extends Cache {
  constructor(size) {
    super(size);
    let dbOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.DB_NAME
    }
    this.queue = new Queue(null, false);
    this.currSize;
    this.dbConnection;
    this.db;
    mongoose.createConnection(process.env.DB_CONNECTION_URI, dbOptions).asPromise()
      .then((connection) => {
        console.log('Connected to DB!');
        this.dbConnection = connection;
        this.db = this.dbConnection.model('CacheResource', CacheResourceSchema);
        this.getCacheSize()
          .then((size) => {
            this.currSize = size;
            console.log('Processing queued cache requests...');
            this.queue.start();
            this.queue.autoProcess = true;
          })
          .catch(() => {
            this.currSize = 0;
          });
      })
       .catch((err) => {
         console.error(err);
         console.error('Failed to connect to DB. Falling back to InMemoryCache...');
         // TODO: Find a way to fallback to InMemoryCache if we can't connect
       });
  }


  async fetch(id) {
    if(!this.db) { console.log('CACHE MISS (connecting to db)'); return null; }
    let resourceId = id.toString();
    try {
      let result = await this.db.findOne({ resourceId }).exec();
      if(new Date(result.expiresAt) < new Date()) {
        console.log('CACHE MISS (expired)');
        await result.remove();
        return null;
      }
      console.log('CACHE HIT');
      return result.data;
    }
    catch(err) {
      console.log('CACHE MISS');
      return null;
    }
  }


  store(id, data, expiresAt) {
    if(!this.db) {
      this.queueRequest(this.store, [...arguments]);  // This will run when the database has connected
      return;
    }

    let resourceId = id.toString();
    let doc = {
      resourceId,
      data,
      expiresAt,
      lastAccessed: new Date()
    };

    let options = { upsert: true, new: false };

    // Upsert the cached resource
    this.db.findOneAndUpdate({ resourceId }, doc, options).exec()
      .then(async (originalDoc) => {
        if(!originalDoc || originalDoc.lastAccessed.getTime() !== doc.lastAccessed.getTime()) {
          // We added a new document
          console.log('Cached', resourceId, 'Expires At', new Date(expiresAt).toISOString());
          this.currSize++;
          console.log('Cache size', await this.getCacheSize());
        }
      })
      .catch((err) => console.error('Failed to add item to cache', err));

    this.enforceMaxSize();
  }


  enforceMaxSize() {
    this.getCacheSize().then((size) => {
      if(size > this.maxSize) { // Remove something from cache
        this.db.find({}).sort('lastAccessed').limit(1).exec()
          .then((doc) => {
            doc.remove();
          })
          .catch(()=>{});
      }
    });
  }


  async getCacheSize() {
    if(this.currSize) { return this.currSize; }
    try {
      return await this.db.countDocuments();
    }
    catch(err) {
      console.error('Failed to get cache size', err);
      return 0;
    }
  }


  /**
   * @method request
   * @param {Function} method - PROTOTYPE METHOD of the instantiated collection. This is what will be run (Ex. UserCollection.getAllUsers)
   * @param {Array} params - parameters to pass to the method being called. This is typically going to be an array with a single query object
   * @param {Function=} callback - function(err, data)
   * @description Queues a task to be run on a database. This design is used to handle race conditions on the database using a FIFO queue
   */
  queueRequest(method, params, callback) {
    let options = {
      method: method,
      params: params,
      callback: callback
    };
    this.queue.push(new QueueMember(options));
  }

}


module.exports = DatabaseCache;