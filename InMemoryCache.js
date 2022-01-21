'use strict';

const Cache = require('./Cache');


class InMemoryCache extends Cache{
  constructor(size) {
    super(size);
    this.cache = new Map();
  }

  fetch(id) {
    return new Promise((resolve, reject) => { // We return a promise here so that we can maintain the interface for other cache strategies
      let result = this.cache.get(id);
      if (result) {
        if (new Date(result.expiresAt) < new Date()) {
          console.log('CACHE MISS (expired)');
          this.cache.delete(id);
          reject();
          return;
        }
        console.log('CACHE HIT');
        resolve(result.data);
        return;
      }
      console.log('CACHE MISS');
      reject();
    });
  }


  store(id, data, expiresAt) {
    this.cache.delete(id);  // invalidate any existing caches for this resource
    this.cache.set(id, {
      expiresAt,
      data
    });
    console.log('Caching', id);
    if(this.cache.size > this.maxSize) {
      let leastRecentlyUsed;
      for(let key of this.cache.keys()) {
        leastRecentlyUsed = key; break; // Get the oldest inserted key (aka first element in map)
      }
      this.cache.delete(leastRecentlyUsed);
    }
  }

}


module.exports = InMemoryCache;