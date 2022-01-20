'use strict';

require('dotenv').config();

const express = require('express'),
  Cache = require('./InMemoryCache'),
  URL = require('url').URL,
  CacheControlParse = require('@tusbar/cache-control').parse,
  http = require('http');
const app = express(),
  cache = new Cache(process.env.CACHE_SIZE);


/**
 * =====================================================
 * Middleware & Routes
 * =====================================================
 */
app.use(formatProxyRequest, checkCache, proxyRequest);


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
  console.log('Proxying request to', parsedUrl.toString());
  res.locals.proxyUrl = parsedUrl.toString();
  res.locals.proxyOptions = options;
  next();
}


function checkCache(req, res, next) {
  let result = cache.fetch(res.locals.proxyUrl);
  if(!result) { return next(); }
  else {
    console.log('Found cache entry');
    Object.keys(result.headers).forEach((header) => res.set(header, result.headers[header]));
    res.status(304).send(result.body);
  }
}


function proxyRequest(req, res) {
  if(!res.locals.proxyUrl) { res.status(500); console.error('No proxyUrl provided to proxyRequest'); return; }
  if(!res.locals.proxyOptions) { res.status(500); console.error('No proxyOptions provided to proxyRequest'); return; }

  let proxyReq = http.request(res.locals.proxyUrl, res.locals.proxyOptions, function(proxyRes) {
    proxyRes.setEncoding('utf8');
    // console.log('Status', proxyRes.statusCode,);
    // console.log('Headers Received', proxyRes.headers);
    if(proxyRes.headers) {
      // Forward headers to the response
      Object.keys(proxyRes.headers).forEach((header) => {
        res.set(header, proxyRes.headers[header]);
      });
      if (proxyRes.headers['content-type']) {
        if (proxyRes.headers['content-type'].indexOf('text/html') === -1) {
          proxyRes.pipe(res);
          return;
        }
      }
    }

    let body = '';
    proxyRes.on('data', (chunk) => { body += chunk; });
    proxyRes.on('end', () => {
      cacheResult(res.locals.proxyUrl, proxyRes, body);
      res.status(200).send(body);   // TODO: When proxying requests through a browser, this shows as jumble of weird characters; The encoding may be wrong but works fine for cURL
    });
  });

  proxyReq.on('error', (err) => {
    console.error(err);
    if(!req.headersSent) {
      res.status(400).json({status: 'failure', error: err});
    }
  });

  if(req.body) { proxyReq.write(req.body); }
  proxyReq.end();
}



/**
 * =====================================================
 * Misc Functions
 * =====================================================
 */
function cacheResult(resourceUrl, res, body) {
  let headers = res.headers;
  if(!headers) { return; }
  if(headers['pragma'] && headers['pragma'] === 'no-cache') { return; }
  console.log(headers);
  if(headers['cache-control']) {
    let cacheControlHeaders = CacheControlParse(res.headers['cache-control']);
    if (cacheControlHeaders.private) { return; }
      let data = {
        body: body,
        headers: headers
      };
      cache.store(resourceUrl, data, 1000*20); // cacheControlHeaders.maxAge);
  }

  // TODO: Add backwards compatibility for HTTP 1.0 Cache control headers
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