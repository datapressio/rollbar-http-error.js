## class HttpError {...}

Wrapper around Rollbar.js, which:

* Comes with its own Express Middleware,
* Allows you to create custom errors with 4xx or 5xx HTTP error codes,
* Files HTTP errors in Rollbar as _info_. Regular old unplanned errors are filed as _error_.
* Fixes the Express request body so Rollbar sees the correct Host, URL, and IP address if behind a proxy.

Usage with Express:

    const express = require('express');
    const HttpError = require('rollbar-http-error');
    const config = require('./config');

    const app = express();
    app.set('trust proxy', true);

    // .. app init code ..

    // Final middleware
    app.use(HttpError.middleware(config.rollbarToken));

If `rollbarToken` is null or undefined, then errors will be printed to the console.

Inside your app, throw errors:

    const HttpError = require('rollbar-http-error');

    // ...

    if (!logged_in) {
      throw HttpError.forbidden('You must be logged in.');
    }
    if (!found) {
      throw HttpError.notFound('That page does not exist.');
    }
    if (!validate(req)) {
      throw HttpError.badRequest('Bad request.');
    }

Throw custom errors:

    if (isDeprecated()) {
      throw new HttpError(410, 'That page is GONE.');
    }

Send custom HTTP headers:

    if (!valid_jwt()) {
      const headers = {
        'WWW-Authenticate': 'Bearer',
      }
      throw new HttpError(401, 'JWT timed out', headers);
    }

Send custom JSON body:

    if (error_details.length) {
      const body = {
        error_details,
      };
      throw new HttpError(403, 'Encountered several errors', {}, body);
    }

Send a good old fashioned 500 error and report the error to rollbar:

    if (!db) {
      throw new Error('Application error: No db is defined');
    }

