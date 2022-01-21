'use strict';

require('dotenv').config();

const express = require('express'),
  morgan = require('morgan'),
  Cache = require('./InMemoryCache'),
  utils = require('./utils'),
  URL = require('url').URL,
  CacheControlParse = require('@tusbar/cache-control').parse,
  http = require('http'),
  https = require('https'),
  fs = require('fs'),
  path = require('path');

const app = express(),
  cache = new Cache(process.env.CACHE_SIZE);

// Certificate
let sslPrivateKey = fs.readFileSync(path.resolve(process.env.SSL_KEY_PATH), 'utf8');
let sslCertificate = fs.readFileSync(path.resolve(process.env.SSL_CERT_PATH), 'utf8');


/**
 * =====================================================
 * Middleware & Routes
 * =====================================================
 */
app.use(morgan('dev'));
app.use(formatProxyRequest, checkCache, proxyRequestFollowRedirects);


/**
 * =====================================================
 * Route Handlers
 * =====================================================
 */
function formatProxyRequest(req, res, next) {
  let fullUrl = req.protocol + '://' + req.hostname + req.baseUrl + req.path;
  if(req.originalUrl.indexOf('?') !== -1) { // Depending on how the proxy server is pinged, req.originalUrl may even contain the protocol, so we split the url into pieces and concat
    fullUrl += req.originalUrl.substring(req.originalUrl.indexOf('?'));
  }
  let parsedUrl = new URL(fullUrl);
  let options = {
    headers: req.headers,
    host: parsedUrl.host,
    path: req.path,
    port: req.protocol === 'http' ? 80 : 443,
    method: req.method
  };
  res.locals.proxyUrl = parsedUrl.toString();
  res.locals.proxyOptions = options;
  next();
}


function checkCache(req, res, next) {
  let result = cache.fetch(res.locals.proxyUrl);
  if(!result) { return next(); }
  else {
    Object.keys(result.headers).forEach((header) => res.set(header, result.headers[header]));
    res.status(304).send(result.body);
  }
}


function proxyRequestFollowRedirects(req, res) {
  if(!res.locals.proxyUrl) { res.status(500); console.error('No proxyUrl provided to proxyRequest'); return; }
  if(!res.locals.proxyOptions) { res.status(500); console.error('No proxyOptions provided to proxyRequest'); return; }
  let options = res.locals.proxyOptions;
  utils.sendHttpRequestWithRedirects(options.method, res.locals.proxyUrl, req.body, options.headers)
    .then((data) => {
      let result = Buffer.from(data.body).toString();
      cacheResult(res.locals.proxyUrl, data.headers, result);
      res.status(200).send(result);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
}


/**
 * =====================================================
 * Misc Functions
 * =====================================================
 */
function cacheResult(resourceUrl, headers, body) {
  if(!headers) { return; }
  if(headers['pragma'] && headers['pragma'] === 'no-cache') { return; }

  let data = {
    body: body,
    headers: headers
  };
  if(headers['cache-control']) {
    // HTTP 1.1 - Current standard
    let cacheControlHeaders = CacheControlParse(headers['cache-control']);
    if (cacheControlHeaders.private) { console.log('Cache-Control is private. Not going to cache'); return; }
      let expiresIn = cacheControlHeaders.maxAge; // max-age is ttl from when the response is *generated* so we have to account for age that the response has been alive in the calculation
      if(headers['age']) { expiresIn -= parseInt(headers['age']); }
      cache.store(resourceUrl, data, Date.now() + expiresIn);
  }
  else if(headers['expires']) {
    // HTTP 1.0 - Backwards compatibility
    cache.store(resourceUrl, data, new Date(headers['expires']).getTime());
  }
  else if(headers['last-modified']) {
    // HTTP 1.0 - Backwards compatibility
    let lastModified = new Date(headers['last-modified']);
    let expiresIn = (Date.now() - lastModified) / 10;  // heuristic for determining how long the resource is "fresh"
    cache.store(resourceUrl, data, Date.now() + expiresIn);
  }
}

/**
 * =====================================================
 * Start Server
 * =====================================================
 */
app.listen(process.env.SERVER_PORT, () => {
  console.log(`Server is running on port ${process.env.SERVER_PORT}`);
});

// Handle any outstanding events
process.on('uncaughtException', function(err) {
  console.error('UNCAUGHT EXCEPTION: ', err); // Don't shutdown the server here. This event will fire many times throughout the server's lifetime
});