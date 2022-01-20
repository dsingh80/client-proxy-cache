const http = require('http');
const {URL} = require('url');


/**
 * @function sendHttpRequestWithRedirects
 * @param {String=} method
 * @param {String} endpoint
 * @param {Object=} body
 * @param {Number=} maxRedirects
 * @returns {Promise<unknown>}
 * @description Send an HTTP request that supports redirects (by default, Node's 'http' module doesn't)
 */
module.exports.sendHttpRequestWithRedirects = function (method = 'GET', endpoint, body, maxRedirects = 3) {
  const TEMP_REDIRECT = 307;
  const PERM_REDIRECT = 301;
  let numRedirects = 0;
  return new Promise((resolve, reject) => {

    let handleData = (data, statusCode, resHeaders) => {
      if (statusCode == TEMP_REDIRECT || statusCode == PERM_REDIRECT) {
        numRedirects++;
        if (numRedirects >= maxRedirects) {
          resolve(data);
          return;
        }
        module.exports.sendHttpRequest(method, resHeaders['location'], body, null, true)
          .then(handleResponseStream)
          .catch(reject);
        return;
      }
      resolve(data);
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

    module.exports.sendHttpRequest(method, endpoint, body, null, true)
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
    // TODO: Support HTTPS requests
    // if (dest.protocol === 'https:') {
    //   protocolModule = https;
    //   options.key = sslPrivateKey;
    //   options.cert = sslCertificate;
    //   options.agent = false;
    // }
    options.headers = customHeaders || {};
    let req = protocolModule.request(options, (res) => {
      if (returnResponseStream) {
        resolve(res);
        return
      }
      let chunks = [];
      res.setEncoding('utf-8');
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