'use strict';

require('dotenv').config();

const http = require('http'),
  https = require('https'),
  fs = require('fs'),
  path = require('path');
const {URL} = require('url');

// Certificate
let sslPrivateKey = fs.readFileSync(path.resolve(process.env.SSL_KEY_PATH), 'utf8');
let sslCertificate = fs.readFileSync(path.resolve(process.env.SSL_CERT_PATH), 'utf8');


/**
 * @function sendHttpRequestWithRedirects
 * @param {String=} method
 * @param {String} endpoint
 * @param {Object=} body
 * @param {Object=} customHeaders
 * @param {Number=} maxRedirects
 * @returns {Promise<unknown>}
 * @description Send an HTTP request that supports redirects (by default, Node's 'http' module doesn't)
 */
module.exports.sendHttpRequestWithRedirects = function (method = 'GET', endpoint, body, customHeaders, maxRedirects = 3) {
  const TEMP_REDIRECT = 307;
  const PERM_REDIRECT = 301;
  let numRedirects = 0;
  return new Promise((resolve, reject) => {

    let handleData = (data, statusCode, resHeaders) => {
      statusCode = parseInt(statusCode);
      let returnPayload = {
        status: statusCode,
        body: data,
        headers: resHeaders
      };
      if (statusCode === TEMP_REDIRECT || statusCode === PERM_REDIRECT) {
        numRedirects++;
        if (numRedirects >= maxRedirects) {
          resolve(returnPayload);
          return;
        }
        module.exports.sendHttpRequest(method, resHeaders['location'], body, customHeaders, true)
          .then(handleResponseStream)
          .catch(reject);
        return;
      }
      resolve(returnPayload);
    };

    let handleResponseStream = (res) => {
      let chunks = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        let data = Buffer.concat(chunks);
        handleData(data, res.statusCode, res.headers)
      });
      res.on('error', (err) => {
        reject(err);
      });
    }

    module.exports.sendHttpRequest(method, endpoint, body, customHeaders, true)
      .then(handleResponseStream)
      .catch(reject);
  })
}


/**
 * @function sendHttpRequest
 * @param {String=} method
 * @param {String} endpoint
 * @param {Object=} body
 * @param {Object=} customHeaders
 * @param {Boolean=} returnResponseStream
 * @returns {Promise<unknown>}
 */
module.exports.sendHttpRequest = function (method = 'GET', endpoint, body, customHeaders = {}, returnResponseStream = false,) {
  let protocolModule = http;

  return new Promise((resolve, reject) => {
    let dest = new URL(endpoint);
    let options = {
      method: method,
      host: dest.host,
      port: dest.port || '', // passing an empty string will let node choose the port based on the protocol
      path: dest.pathname + '?' + dest.searchParams,
      protocol: dest.protocol
    };
    if (dest.protocol === 'https:') {
      protocolModule = https;
      options.key = sslPrivateKey;
      options.cert = sslCertificate;
      options.agent = false;
    }
    options.headers = customHeaders || {};
    let req = protocolModule.request(options, (res) => {
      if (returnResponseStream) {
        resolve(res);
        return
      }
      let chunks = [];
      res.setEncoding('utf8');
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        let data = Buffer.concat(chunks);
        resolve(data.toString());
      });
      res.on('error', (err) => {
        reject(err);
      });
    });
    Object.keys(options.headers).forEach((header) => {
      if(header.toLowerCase() === 'content-type') {
        if(options.headers[header] === 'application/json') {
          body = JSON.stringify(body);
        }
      }
    });
    if (body) {
      req.write(body);
    }
    req.end();
  });
}