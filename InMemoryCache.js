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