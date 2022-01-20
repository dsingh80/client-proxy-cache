'use strict';

require('dotenv').config();
const express = require('express'),
  needle = require('needle'),
  URL = require('url').URL,
  http = require('http');

const app = express();

app.get('/', httpRequestHandler);


function httpRequestHandler(req, res) {
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
  let proxyReq = http.request(parsedUrl.toString(), options, function(proxyRes) {
    console.log('Status', proxyRes.statusCode,);
    console.log('Headers Received', proxyRes.headers);
    if(proxyRes.headers && proxyRes.headers['content-type']) {
      console.log('Content-Type', proxyRes.headers['content-type']);
      if(proxyRes.headers['content-type'].indexOf('text/html') !== -1) {
        // TODO: We should store this in cache right now
        proxyRes.pipe(res);
        return;
      }

    }

    proxyRes.setEncoding('utf8');
    let body = '';
    proxyRes.on('data', (chunk) => {
      body += chunk;
      console.log('Chunk', chunk);
    });
    proxyRes.on('end', () => {
      res.status(200).json({ status: 'success', data: body });
    });
  });

  proxyReq.on('error', (err) => {
    console.error(err);
    res.status(400).json({ status: 'failure', error: err });
  });

  if(req.body) {
    proxyReq.write(req.body);
  }
  proxyReq.end();
}


function needlRequestHandler(req, res) {
    console.log('Starting proxy request');
    console.log(req.url);
    needle.request(req.method, req.url, req.data, { follow: 3 },(err, proxyRes) => {
      if(err) {
        console.log(err);
        res.status(400).json({
          status: 'failure',
          error: err
        });
        return;
      }
      console.log(proxyRes.statusCode, proxyRes.headers);
      res.status(200).json({
        status: 'success',
        data: proxyRes.body
      });
    });
}


app.listen(process.env.SERVER_PORT, () => {
  console.log(`Server is running on port ${process.env.SERVER_PORT}`);
});