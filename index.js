/* eslint-disable no-console */
const PrettyError = require('pretty-error');
const Rollbar = require('rollbar');

const pretty = new PrettyError();
pretty.skipNodeFiles();
pretty.skipPackage('express');

let rollbar;

/*
 * Generator used to create Rollbar functions which might
 * write to the console if you're not connected to the remote.
 */
function wrapRollbarFunction(functionName) {
  return (...argz) => {
    if (`${process.env.NODE_ENV}`.toLowerCase() === 'test') {
      return;
    }
    if (rollbar) {
      rollbar[functionName](...argz);
    }
    else {
      const arg = argz.shift();
      if (arg instanceof Error) {
        console.log(pretty.render(arg));
      }
      else {
        console.log(`[${functionName}]: ${JSON.stringify(arg, null, 2)}`);
      }
    }
  };
}

const reportDebug = wrapRollbarFunction('debug');
const reportInfo = wrapRollbarFunction('info');
const reportWarning = wrapRollbarFunction('warning');
const reportError = wrapRollbarFunction('error');

/*
 * Wrapper for Errors which you can throw around
 * and carry a HTTP status, optionally overriding
 * the JSON body and headers when caught by our middleware.
 */
class HttpError extends Error {
  constructor(status, message, headers = {}, body = {}, custom = undefined) {
    super(message);
    if (typeof status !== 'number') {
      throw new Error(`Expected HttpError status to be a number, got ${typeof status}`);
    }
    if (typeof body !== 'object') {
      throw new Error(`Expected body to be an object, got ${typeof body}`);
    }
    if (custom && (typeof custom !== 'object')) {
      throw new Error(`Expected custom to be an object, got ${typeof custom}`);
    }
    this.name = `[${status}]`;
    this.status = status;
    this.headers = headers;
    this.body = body;
    this.custom = custom;
    if (!this.body.hasOwnProperty('error')) {
      body.error = message;
    }
  }

  withBody(obj) {
    for (const key of Object.keys(obj)) {
      this.body[key] = obj[key];
    }
    return this;
  }

  withCustom(obj) {
    if (this.custom === undefined) {
      this.custom = {};
    }
    for (const key of Object.keys(obj)) {
      this.custom[key] = obj[key];
    }
    return this;
  }

  // --------------
  //
  static badRequest(message) {
    return new HttpError(400, message);
  }

  static unauthorized(message, authenticateHeader = 'Bearer') {
    // Spec compliance: This is required
    const headers = {
      'WWW-Authenticate': authenticateHeader,
    };
    return new HttpError(401, message, headers);
  }

  static forbidden(message) {
    return new HttpError(403, message);
  }

  static notFound(message) {
    return new HttpError(404, message);
  }

  // --------------

  static rollbar() {
    return rollbar;
  }

  // --------------

  static get report() {
    return {
      debug: reportDebug,
      info: reportInfo,
      warning: reportWarning,
      error: reportError,
    };
  }

  // --------------

  /*
   * Middleware used to gracefully handle errors. If they're planned
   * then log them as rollbar.info(). Unplanned go in as errors.
   */
  static middleware(accessToken, environment = 'production') {
    if (accessToken) {
      rollbar = new Rollbar({
        accessToken,
        environment,
      });
      console.log(`Connecting to Rollbar [environment=${environment}]`);
    }
    else {
      console.log('No Rollbar token is set. Errors will go to console.log');
    }

    return function rollbarErrorHandler(err, request, response, next) {
      try {
        // Rollbar and BodyParser get confused about GET requests. Quickfix:
        if (request.method === 'GET' && request.body && !Object.keys(request.body).length) {
          delete request.body;
        }
        // Rollbar "url" column should use X-Forwarded-Host behind a proxy. Quickfix:
        if (request.headers && request.headers['x-forwarded-host']) {
          request.headers['x-real-host'] = request.headers.host;
          request.headers.host = request.headers['x-forwarded-host'];
        }
        // Sync with Rollbar, or the console
        if (err.hasOwnProperty('status')) {
          reportInfo(err, request, {
            custom: err.custom,
          });
        }
        else {
          reportError(err, request, {
            custom: err.custom,
          });
        }

        // Response: status
        response.status(err.status || 500);
        // Response: headers
        if (err.hasOwnProperty('headers')) {
          for (const key of Object.keys(err.headers)) {
            response.header(key, err.headers[key]);
          }
        }
        // Response: Body
        const body = err.hasOwnProperty('body') ? err.body : { error: err.message };
        response.json(body);
      }
      catch (e) {
        try {
          // YOU WERE SUPPOSED TO BRING BALANCE TO THE FORCE, NOT LEAVE IT IN DARKNESS
          // (Landing here is really awkward and bad)
          e.message = `Uncaught error in middleware: ${e.message}`;
          console.error(e);
          if (rollbar) {
            rollbar.error(e, request);
          }
        }
        catch (ee) {
          next(ee);
        }
      }
    };
  }

}

module.exports = HttpError;
