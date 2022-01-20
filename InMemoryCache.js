'use strict';


class InMemoryCache {
  constructor(size) {
    this.cache = new Map();
    this.maxSize = size;
  }

  fetch(resource) {
    let result = this.cache.get(resource);
    if(result) {
      if(new Date(result.expiresAt) < new Date()) {
        console.log('CACHE MISS (expired)');
        this.cache.delete(resource);
        return null;
      }
      console.log('CACHE HIT');
      return result.data;
    }
    console.log('CACHE MISS');
    return null;
  }


  store(id, data, expiresIn) {
    this.cache.delete(id);  // invalidate any existing caches for this resource
    this.cache.set(id, {
      expiresAt: Date.now() + expiresIn,
      data
    });

    if(this.cache.size > this.maxSize) {
      let leastRecentlyUsed = this.cache.keys()[0]; // Get the oldest inserted key
      this.cache.delete(leastRecentlyUsed);
    }
  }

}


module.exports = InMemoryCache;