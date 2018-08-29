(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.h54s = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
* h54s error constructor
* @constructor
*
*@param {string} type - Error type
*@param {string} message - Error message
*@param {string} status - Error status returned from SAS
*
*/
function h54sError(type, message, status) {
  if(Error.captureStackTrace) {
    Error.captureStackTrace(this);
  }
  this.message = message;
  this.type    = type;
  this.status  = status;
}

h54sError.prototype = Object.create(Error.prototype, {
  constructor: {
    configurable: false,
    enumerable: false,
    writable: false,
    value: h54sError
  },
  name: {
    configurable: false,
    enumerable: false,
    writable: false,
    value: 'h54sError'
  }
});

module.exports = h54sError;

},{}],2:[function(require,module,exports){
var h54sError = require('../error.js');

/*
* h54s SAS Files object constructor
* @constructor
*
*@param {file} file - File added when object is created
*@param {string} macroName - macro name
*
*/
function Files(file, macroName) {
  this._files = {};

  Files.prototype.add.call(this, file, macroName);
}

/*
* Add file to files object
* @param {file} file - Instance of JavaScript File object
* @param {string} macroName - Sas macro name
*
*/
Files.prototype.add = function(file, macroName) {
  if(file && macroName) {
    if(!(file instanceof File || file instanceof Blob)) {
      throw new h54sError('argumentError', 'First argument must be instance of File object');
    }
    if(typeof macroName !== 'string') {
      throw new h54sError('argumentError', 'Second argument must be string');
    }
    if(!isNaN(macroName[macroName.length - 1])) {
      throw new h54sError('argumentError', 'Macro name cannot have number at the end');
    }
  } else {
    throw new h54sError('argumentError', 'Missing arguments');
  }

  this._files[macroName] = [
    'FILE',
    file
  ];
};

module.exports = Files;

},{"../error.js":1}],3:[function(require,module,exports){
var h54sError = require('./error.js');

/*
* Represents html5 for sas adapter
* @constructor
*
*@param {object} config - adapter config object, with keys like url, debug, etc.
*
*/
var h54s = module.exports = function(config) {

  //default config values
  this.maxXhrRetries        = 5;
  this.url                  = "/SASStoredProcess/do";
  this.debug                = false;
  this.loginUrl             = '/SASLogon/Logon.do';
  this.retryAfterLogin      = true;
  this.ajaxTimeout          = 30000;
  this.useMultipartFormData = true;
  this.RESTauth             = false;
  this.RESTauthLoginUrl     = '/SASLogon/v1/tickets';

  this.remoteConfigUpdateCallbacks = [];
  this._pendingCalls = [];
  this._ajax = require('./methods/ajax.js')();

  _setConfig.call(this, config);

  //override with remote if set
  if(config && config.isRemoteConfig) {
    var self = this;

    this._disableCalls = true;

    // 'h54sConfig.json' is for the testing with karma
    //replaced with gulp in dev build
    this._ajax.get('h54sConfig.json').success(function(res) {
      var remoteConfig = JSON.parse(res.responseText);

      for(var key in remoteConfig) {
        if(remoteConfig.hasOwnProperty(key) && config[key] === undefined && key !== 'isRemoteConfig') {
          config[key] = remoteConfig[key];
        }
      }

      _setConfig.call(self, config);

      //execute callbacks when we have remote config
      //note that remote conifg is merged with instance config
      for(var i = 0, n = self.remoteConfigUpdateCallbacks.length; i < n; i++) {
        var fn = self.remoteConfigUpdateCallbacks[i];
        fn();
      }

      //execute sas calls disabled while waiting for the config
      self._disableCalls = false;
      while(self._pendingCalls.length > 0) {
        var pendingCall = self._pendingCalls.shift();
        var sasProgram  = pendingCall.sasProgram;
        var callback    = pendingCall.callback;
        var params      = pendingCall.params;

        //update program with metadataRoot if it's not set
        if(self.metadataRoot && pendingCall.params._program.indexOf(self.metadataRoot) === -1) {
          pendingCall.params._program = self.metadataRoot.replace(/\/?$/, '/') + pendingCall.params._program.replace(/^\//, '');
        }

        //update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        self.call(sasProgram, null, callback, params);
      }
    }).error(function (err) {
      throw new h54sError('ajaxError', 'Remote config file cannot be loaded. Http status code: ' + err.status);
    });
  }

  // private function to set h54s instance properties
  function _setConfig(config) {
    if(!config) {
      this._ajax.setTimeout(this.ajaxTimeout);
      return;
    } else if(typeof config !== 'object') {
      throw new h54sError('argumentError', 'First parameter should be config object');
    }

    //merge config object from parameter with this
    for(var key in config) {
      if(config.hasOwnProperty(key)) {
        if((key === 'url' || key === 'loginUrl') && config[key].charAt(0) !== '/') {
          config[key] = '/' + config[key];
        }
        this[key] = config[key];
      }
    }

    //if server is remote use the full server url
    //NOTE: this is not permited by the same-origin policy
    if(config.hostUrl) {
      if(config.hostUrl.charAt(config.hostUrl.length - 1) === '/') {
        config.hostUrl = config.hostUrl.slice(0, -1);
      }
      this.hostUrl          = config.hostUrl;
      this.url              = config.hostUrl + this.url;
      this.loginUrl         = config.hostUrl + this.loginUrl;
      this.RESTauthLoginUrl = config.hostUrl + this.RESTauthLoginUrl;
    }

    this._ajax.setTimeout(this.ajaxTimeout);
  }
};

//replaced with gulp
h54s.version = '0.11.0';


h54s.prototype = require('./methods');

h54s.Tables = require('./tables');
h54s.Files = require('./files');
h54s.SasData = require('./sasData.js');

h54s.fromSasDateTime = require('./methods/utils.js').fromSasDateTime;
h54s.toSasDateTime = require('./tables/utils.js').toSasDateTime;

//self invoked function module
require('./ie_polyfills.js');

},{"./error.js":1,"./files":2,"./ie_polyfills.js":4,"./methods":7,"./methods/ajax.js":6,"./methods/utils.js":8,"./sasData.js":9,"./tables":10,"./tables/utils.js":11}],4:[function(require,module,exports){
module.exports = function() {
  if (!Object.create) {
    Object.create = function(proto, props) {
      if (typeof props !== "undefined") {
        throw "The multiple-argument version of Object.create is not provided by this browser and cannot be shimmed.";
      }
      function ctor() { }
      ctor.prototype = proto;
      return new ctor();
    };
  }


  // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
  if (!Object.keys) {
    Object.keys = (function () {
      'use strict';
      var hasOwnProperty = Object.prototype.hasOwnProperty,
          hasDontEnumBug = !({toString: null}).propertyIsEnumerable('toString'),
          dontEnums = [
            'toString',
            'toLocaleString',
            'valueOf',
            'hasOwnProperty',
            'isPrototypeOf',
            'propertyIsEnumerable',
            'constructor'
          ],
          dontEnumsLength = dontEnums.length;

      return function (obj) {
        if (typeof obj !== 'object' && (typeof obj !== 'function' || obj === null)) {
          throw new TypeError('Object.keys called on non-object');
        }

        var result = [], prop, i;

        for (prop in obj) {
          if (hasOwnProperty.call(obj, prop)) {
            result.push(prop);
          }
        }

        if (hasDontEnumBug) {
          for (i = 0; i < dontEnumsLength; i++) {
            if (hasOwnProperty.call(obj, dontEnums[i])) {
              result.push(dontEnums[i]);
            }
          }
        }
        return result;
      };
    }());
  }

  // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/lastIndexOf
  if (!Array.prototype.lastIndexOf) {
    Array.prototype.lastIndexOf = function(searchElement /*, fromIndex*/) {
      'use strict';

      if (this === void 0 || this === null) {
        throw new TypeError();
      }

      var n, k,
        t = Object(this),
        len = t.length >>> 0;
      if (len === 0) {
        return -1;
      }

      n = len - 1;
      if (arguments.length > 1) {
        n = Number(arguments[1]);
        if (n != n) {
          n = 0;
        }
        else if (n !== 0 && n != (1 / 0) && n != -(1 / 0)) {
          n = (n > 0 || -1) * Math.floor(Math.abs(n));
        }
      }

      for (k = n >= 0 ? Math.min(n, len - 1) : len - Math.abs(n); k >= 0; k--) {
        if (k in t && t[k] === searchElement) {
          return k;
        }
      }
      return -1;
    };
  }
}();

},{}],5:[function(require,module,exports){
var logs = {
  applicationLogs: [],
  debugData: [],
  sasErrors: [],
  failedRequests: []
};

var limits = {
  applicationLogs: 100,
  debugData: 20,
  failedRequests: 20,
  sasErrors: 100
};

module.exports.get = {
  getSasErrors: function() {
    return logs.sasErrors;
  },
  getApplicationLogs: function() {
    return logs.applicationLogs;
  },
  getDebugData: function() {
    return logs.debugData;
  },
  getFailedRequests: function() {
    return logs.failedRequests;
  }
};

module.exports.clear = {
  clearApplicationLogs: function() {
    logs.applicationLogs.splice(0, logs.applicationLogs.length);
  },
  clearDebugData: function() {
    logs.debugData.splice(0, logs.debugData.length);
  },
  clearSasErrors: function() {
    logs.sasErrors.splice(0, logs.sasErrors.length);
  },
  clearFailedRequests: function() {
    logs.failedRequests.splice(0, logs.failedRequests.length);
  },
  clearAllLogs: function() {
    this.clearApplicationLogs();
    this.clearDebugData();
    this.clearSasErrors();
    this.clearFailedRequests();
  }
};

/*
* Adds application logs to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addApplicationLog = function(message, sasProgram) {
  if(message === 'blank') {
    return;
  }
  var log = {
    message:    message,
    time:       new Date(),
    sasProgram: sasProgram
  };
  logs.applicationLogs.push(log);

  if(logs.applicationLogs.length > limits.applicationLogs) {
    logs.applicationLogs.shift();
  }
};

/*
* Adds debug data to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addDebugData = function(htmlData, debugText, sasProgram, params) {
  logs.debugData.push({
    debugHtml:  htmlData,
    debugText:  debugText,
    sasProgram: sasProgram,
    params:     params,
    time:       new Date()
  });

  if(logs.debugData.length > limits.debugData) {
    logs.debugData.shift();
  }
};

/*
* Adds failed requests to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addFailedRequest = function(responseText, debugText, sasProgram) {
  logs.failedRequests.push({
    responseHtml: responseText,
    responseText: debugText,
    sasProgram:   sasProgram,
    time:         new Date()
  });

  //max 20 failed requests
  if(logs.failedRequests.length > limits.failedRequests) {
    logs.failedRequests.shift();
  }
};

/*
* Adds SAS errors to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addSasErrors = function(errors) {
  logs.sasErrors = logs.sasErrors.concat(errors);

  while(logs.sasErrors.length > limits.sasErrors) {
    logs.sasErrors.shift();
  }
};

},{}],6:[function(require,module,exports){
module.exports = function() {
  var timeout = 30000;
  var timeoutHandle;

  var xhr = function(type, url, data, multipartFormData) {
    var methods = {
      success: function() {},
      error:   function() {}
    };
    var XHR     = XMLHttpRequest || ActiveXObject;
    var request = new XHR('MSXML2.XMLHTTP.3.0');

    request.open(type, url, true);

    //multipart/form-data is set automatically so no need for else block
    if(!multipartFormData) {
      request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    }
    request.onreadystatechange = function () {
      if (request.readyState === 4) {
        clearTimeout(timeoutHandle);
        if (request.status >= 200 && request.status < 300) {
          methods.success.call(methods, request);
        } else {
          methods.error.call(methods, request);
        }
      }
    };

    if(timeout > 0) {
      timeoutHandle = setTimeout(function() {
        request.abort();
      }, timeout);
    }

    request.send(data);

    return {
      success: function (callback) {
        methods.success = callback;
        return this;
      },
      error: function (callback) {
        methods.error = callback;
        return this;
      }
    };
  };

  var serialize = function(obj) {
    var str = [];
    for(var p in obj) {
      if (obj.hasOwnProperty(p)) {
        if(obj[p] instanceof Array) {
          for(var i = 0, n = obj[p].length; i < n; i++) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p][i]));
          }
        } else {
          str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
      }
    }
    return str.join("&");
  };

  var createMultipartFormDataPayload = function(obj) {
    var data = new FormData();
    for(var p in obj) {
      if(obj.hasOwnProperty(p)) {
        if(obj[p] instanceof Array) {
          for(var i = 0, n = obj[p].length; i < n; i++) {
            data.append(p, obj[p][i]);
          }
        } else {
          data.append(p, obj[p]);
        }
      }
    }
    return data;
  };

  return {
    get: function(url, data) {
      var dataStr;
      if(typeof data === 'object') {
        dataStr = serialize(data);
      }
      var urlWithParams = dataStr ? (url + '?' + dataStr) : url;
      return xhr('GET', urlWithParams);
    },
    post: function(url, data, multipartFormData) {
      var payload;
      if(typeof data === 'object') {
        if(multipartFormData) {
          payload = createMultipartFormDataPayload(data);
        } else {
          payload = serialize(data);
        }
      }
      return xhr('POST', url, payload, multipartFormData);
    },
    setTimeout: function(t) {
      timeout = t;
    }
  };
};

},{}],7:[function(require,module,exports){
var h54sError = require('../error.js');
var logs = require('../logs.js');
var Tables = require('../tables');
var SasData = require('../sasData.js');
var Files = require('../files');

/*
* Call Sas program
*
* @param {string} sasProgram - Path of the sas program
* @param {function} callback - Callback function called when ajax call is finished
*
*/
module.exports.call = function(sasProgram, dataObj, callback, params) {
  var self        = this;
  var retryCount  = 0;
  var dbg         = this.debug;

  if (!callback || typeof callback !== 'function'){
    throw new h54sError('argumentError', 'You must provide callback');
  }
  if(!sasProgram) {
    throw new h54sError('argumentError', 'You must provide Sas program file path');
  }
  if(typeof sasProgram !== 'string') {
    throw new h54sError('argumentError', 'First parameter should be string');
  }
  if(this.useMultipartFormData === false && !(dataObj instanceof Tables)) {
    throw new h54sError('argumentError', 'Cannot send files using application/x-www-form-urlencoded. Please use Tables or default value for useMultipartFormData');
  }

  if(!params) {
    params = {
      _program: this._utils.getFullProgramPath(this.metadataRoot, sasProgram),
      _debug:   this.debug ? 131 : 0,
      _service: 'default',
    };
  }

  if(dataObj) {
    var key, dataProvider;
    if(dataObj instanceof Tables) {
      dataProvider = dataObj._tables;
    } else if(dataObj instanceof Files || dataObj instanceof SasData){
      dataProvider = dataObj._files;
    } else {
      throw new h54sError('argumentError', 'Wrong type of tables object');
    }
    for(key in dataProvider) {
      if(dataProvider.hasOwnProperty(key)) {
        params[key] = dataProvider[key];
      }
    }
  }

  if(this._disableCalls) {
    this._pendingCalls.push({
      sasProgram: sasProgram,
      callback:   callback,
      params:     params
    });
    return;
  }

  this._ajax.post(this.url, params, this.useMultipartFormData).success(function(res) {
    if(self._utils.needToLogin.call(self, res)) {
      //remember the call for latter use
      self._pendingCalls.push({
        sasProgram: sasProgram,
        callback:   callback,
        params:     params
      });

      //there's no need to continue if previous call returned login error
      if(self._disableCalls) {
        return;
      } else {
        self._disableCalls = true;
      }

      callback(new h54sError('notLoggedinError', 'You are not logged in'));
    } else {
      var resObj, unescapedResObj, err;
      var done = false;

      if(!dbg) {
        try {
          resObj = self._utils.parseRes(res.responseText, sasProgram, params);
          logs.addApplicationLog(resObj.logmessage, sasProgram);

          if(dataObj instanceof Tables) {
            unescapedResObj = self._utils.unescapeValues(resObj);
          } else {
            unescapedResObj = resObj;
          }

          if(resObj.status !== 'success') {
            err = new h54sError('programError', resObj.errormessage, resObj.status);
          }

          done = true;
        } catch(e) {
          if(e instanceof SyntaxError) {
            if(retryCount < self.maxXhrRetries) {
              done = false;
              self._ajax.post(self.url, params, self.useMultipartFormData).success(this.success).error(this.error);
              retryCount++;
              logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
            } else {
              self._utils.parseErrorResponse(res.responseText, sasProgram);
              self._utils.addFailedResponse(res.responseText, sasProgram);
              err = new h54sError('parseError', 'Unable to parse response json');
              done = true;
            }
          } else if(e instanceof h54sError) {
            self._utils.parseErrorResponse(res.responseText, sasProgram);
            self._utils.addFailedResponse(res.responseText, sasProgram);
            err = e;
            done = true;
          } else {
            self._utils.parseErrorResponse(res.responseText, sasProgram);
            self._utils.addFailedResponse(res.responseText, sasProgram);
            err = new h54sError('unknownError', e.message);
            err.stack = e.stack;
            done = true;
          }
        } finally {
          if(done) {
            callback(err, unescapedResObj);
          }
        }
      } else {
        try {
          resObj = self._utils.parseDebugRes(res.responseText, sasProgram, params);
          logs.addApplicationLog(resObj.logmessage, sasProgram);

          if(dataObj instanceof Tables) {
            unescapedResObj = self._utils.unescapeValues(resObj);
          } else {
            unescapedResObj = resObj;
          }

          if(resObj.status !== 'success') {
            err = new h54sError('programError', resObj.errormessage, resObj.status);
          }

          done = true;
        } catch(e) {
          if(e instanceof SyntaxError) {
            err = new h54sError('parseError', e.message);
            done = true;
          } else if(e instanceof h54sError) {
            if(e.type === 'parseError' && retryCount < 1) {
              done = false;
              self._ajax.post(self.url, params, self.useMultipartFormData).success(this.success).error(this.error);
              retryCount++;
              logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
            } else {
              if(e instanceof h54sError) {
                err = e;
              } else {
                err = new h54sError('parseError', 'Unable to parse response json');
              }
              done = true;
            }
          } else {
            err = new h54sError('unknownError', e.message);
            err.stack = e.stack;
            done = true;
          }
        } finally {
          if(done) {
            callback(err, unescapedResObj);
          }
        }
      }
    }
  }).error(function(res) {
    if(res.status === 401) {
      callback(new h54sError('notLoggedinError', 'You are not logged in'));
    } else {
      logs.addApplicationLog('Request failed with status: ' + res.status, sasProgram);
      callback(new h54sError('httpError', res.statusText));
    }
  });
};

/*
* Login method
*
* @param {string} user - Login username
* @param {string} pass - Login password
* @param {function} callback - Callback function called when ajax call is finished
*
* OR
*
* @param {function} callback - Callback function called when ajax call is finished
*
*/
module.exports.login = function(user, pass, callback) {
  if(!user || !pass) {
    throw new h54sError('argumentError', 'Credentials not set');
  }
  if(typeof user !== 'string' || typeof pass !== 'string') {
    throw new h54sError('argumentError', 'User and pass parameters must be strings');
  }
  //NOTE: callback optional?
  if(!callback || typeof callback !== 'function') {
    throw new h54sError('argumentError', 'You must provide callback');
  }

  if(!this.RESTauth) {
    handleSasLogon.call(this, user, pass, callback);
  } else {
    handleRestLogon.call(this, user, pass, callback);
  }
};

function handleSasLogon(user, pass, callback) {
  var self = this;

  var loginParams = {
    _service: 'default',
    ux: user,
    px: pass,
    //for SAS 9.4,
    username: user,
    password: pass
  };

  for (var key in this._aditionalLoginParams) {
    loginParams[key] = this._aditionalLoginParams[key];
  }

  this._loginAttempts = 0;

  this._ajax.post(this.loginUrl, loginParams).success(function(res) {
    if(++self._loginAttempts === 3) {
      return callback(-2);
    }

    if(self._utils.needToLogin.call(self, res)) {
      //we are getting form again after redirect
      //and need to login again using the new url
      //_loginChanged is set in needToLogin function
      //but if login url is not different, we are checking if there are aditional parameters
      if(self._loginChanged || (self._isNewLoginPage && !self._aditionalLoginParams)) {
        delete self._loginChanged;

        var inputs = res.responseText.match(/<input.*"hidden"[^>]*>/g);
        if(inputs) {
          inputs.forEach(function(inputStr) {
            var valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
            loginParams[valueMatch[1]] = valueMatch[2];
          });
        }

        var success = this.success, error = this.error;
        self._ajax.post(self.loginUrl, loginParams).success(function() {
          //we need this get request because of the sas 9.4 security checks
          self._ajax.get(self.url).success(success).error(error);
        }).error(this.error);
      } else {
        //getting form again, but it wasn't a redirect
        logs.addApplicationLog('Wrong username or password');
        callback(-1);
      }
    } else {
      callback(res.status);

      self._disableCalls = false;

      while(self._pendingCalls.length > 0) {
        var pendingCall     = self._pendingCalls.shift();
        var method          = pendingCall.method || self.call.bind(self);
        var sasProgram      = pendingCall.sasProgram;
        var callbackPending = pendingCall.callback;
        var params          = pendingCall.params;

        //update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        if(self.retryAfterLogin) {
          method(sasProgram, null, callbackPending, params);
        }
      }
    }
  }).error(function(res) {
    logs.addApplicationLog('Login failed with status code: ' + res.status);
    callback(res.status);
  });
}

function handleRestLogon(user, pass, callback) {
  var self = this;

  var loginParams = {
    username: user,
    password: pass
  };

  this._ajax.post(this.RESTauthLoginUrl, loginParams).success(function(res) {
    var location = res.getResponseHeader('Location');

    self._ajax.post(location, {
      service: self.url
    }).success(function(res) {
      if(self.url.indexOf('?') === -1) {
        self.url += '?ticket=' + res.responseText;
      } else {
        if(self.url.indexOf('ticket') !== -1) {
          self.url = self.url.replace(/ticket=[^&]+/, 'ticket=' + res.responseText);
        } else {
          self.url += '&ticket=' + res.responseText;
        }
      }

      callback(res.status);
    }).error(function(res) {
      logs.addApplicationLog('Login failed with status code: ' + res.status);
      callback(res.status);
    });
  }).error(function(res) {
    if(res.responseText === 'error.authentication.credentials.bad') {
      callback(-1);
    } else {
      logs.addApplicationLog('Login failed with status code: ' + res.status);
      callback(res.status);
    }
  });
}

/*
* Logout method
*
* @param {function} callback - Callback function called when ajax call is finished
*
*/

module.exports.logout = function(callback) {
  this._ajax.get(this.url, {_action: 'logoff'}).success(function(res) {
    callback();
  }).error(function(res) {
    logs.addApplicationLog('Logout failed with status code: ' + res.status);
    callback(res.status);
  });
};

/*
* Enter debug mode
*
*/
module.exports.setDebugMode = function() {
  this.debug = true;
};

/*
* Exit debug mode
*
*/
module.exports.unsetDebugMode = function() {
  this.debug = false;
};

for(var key in logs.get) {
  if(logs.get.hasOwnProperty(key)) {
    module.exports[key] = logs.get[key];
  }
}

for(var key in logs.clear) {
  if(logs.clear.hasOwnProperty(key)) {
    module.exports[key] = logs.clear[key];
  }
}

/*
* Add callback functions executed when properties are updated with remote config
*
*@callback - callback pushed to array
*
*/
module.exports.onRemoteConfigUpdate = function(callback) {
  this.remoteConfigUpdateCallbacks.push(callback);
};

module.exports._utils = require('./utils.js');

},{"../error.js":1,"../files":2,"../logs.js":5,"../sasData.js":9,"../tables":10,"./utils.js":8}],8:[function(require,module,exports){
var logs = require('../logs.js');
var h54sError = require('../error.js');

var programNotFoundPatt = /<title>(Stored Process Error|SASStoredProcess)<\/title>[\s\S]*<h2>(Stored process not found:.*|.*not a valid stored process path.)<\/h2>/;
var responseReplace = function(res) {
  return res.replace(/(\r\n|\r|\n)/g, '').replace(/\\\\(n|r|t|f|b)/g, '\\$1').replace(/\\"\\"/g, '\\"');
};

/*
* Parse response from server
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
* @param {object} params - params sent to sas program with addTable
*
*/
module.exports.parseRes = function(responseText, sasProgram, params) {
  var matches = responseText.match(programNotFoundPatt);
  if(matches) {
    throw new h54sError('programNotFound', 'You have not been granted permission to perform this action, or the STP is missing.');
  }
  //remove new lines in json response
  //replace \\(d) with \(d) - SAS json parser is escaping it
  return JSON.parse(responseReplace(responseText));
};

/*
* Parse response from server in debug mode
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
* @param {object} params - params sent to sas program with addTable
*
*/
module.exports.parseDebugRes = function(responseText, sasProgram, params) {
  var matches = responseText.match(programNotFoundPatt);
  if(matches) {
    throw new h54sError('programNotFound', 'You have not been granted permission to perform this action, or the STP is missing.');
  }

  //find json
  patt              = /^(.?--h54s-data-start--)([\S\s]*?)(--h54s-data-end--)/m;
  matches           = responseText.match(patt);

  var page          = responseText.replace(patt, '');
  var htmlBodyPatt  = /<body.*>([\s\S]*)<\/body>/;
  var bodyMatches   = page.match(htmlBodyPatt);

  //remove html tags
  var debugText = bodyMatches[1].replace(/<[^>]*>/g, '');
  debugText     = this.decodeHTMLEntities(debugText);

  logs.addDebugData(bodyMatches[1], debugText, sasProgram, params);

  if(this.parseErrorResponse(responseText, sasProgram)) {
    throw new h54sError('sasError', 'Sas program completed with errors');
  }

  if(!matches) {
    throw new h54sError('parseError', 'Unable to parse response json');
  }
  //remove new lines in json response
  //replace \\(d) with \(d) - SAS json parser is escaping it
  var jsonObj = JSON.parse(responseReplace(matches[2]));

  return jsonObj;
};

/*
* Add failed response to logs - used only if debug=false
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
*
*/
module.exports.addFailedResponse = function(responseText, sasProgram) {
  var patt      = /<script([\s\S]*)\/form>/;
  var patt2     = /display\s?:\s?none;?\s?/;
  //remove script with form for toggling the logs and "display:none" from style
  responseText  = responseText.replace(patt, '').replace(patt2, '');
  var debugText = responseText.replace(/<[^>]*>/g, '');
  debugText = this.decodeHTMLEntities(debugText);

  logs.addFailedRequest(responseText, debugText, sasProgram);
};

/*
* Unescape all string values in returned object
*
* @param {object} obj
*
*/
module.exports.unescapeValues = function(obj) {
  for (var key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = decodeURIComponent(obj[key]);
    } else if(typeof obj === 'object') {
      this.unescapeValues(obj[key]);
    }
  }
  return obj;
};

/*
* Parse error response from server and save errors in memory
*
* @param {string} res - server response
* #param {string} sasProgram - sas program which returned the response
*
*/
module.exports.parseErrorResponse = function(res, sasProgram) {
  //capture 'ERROR: [text].' or 'ERROR xx [text].'
  var patt    = /^ERROR(:\s|\s\d\d)(.*\.|.*\n.*\.)/gm;
  var errors  = res.replace(/(<([^>]+)>)/ig, '').match(patt);
  if(!errors) {
    return;
  }

  var errMessage;
  for(var i = 0, n = errors.length; i < n; i++) {
    errMessage  = errors[i].replace(/<[^>]*>/g, '').replace(/(\n|\s{2,})/g, ' ');
    errMessage  = this.decodeHTMLEntities(errMessage);
    errors[i]   = {
      sasProgram: sasProgram,
      message:    errMessage,
      time:       new Date()
    };
  }

  logs.addSasErrors(errors);

  return true;
};

/*
* Decode HTML entities
*
* @param {string} res - server response
*
*/
module.exports.decodeHTMLEntities = function (html) {
  var tempElement = document.createElement('span');
  var str         = html.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    function (str) {
      tempElement.innerHTML = str;
      str                   = tempElement.textContent || tempElement.innerText;
      return str;
    }
  );
  return str;
};

/*
* Convert sas time to javascript date
*
* @param {number} sasDate - sas Tate object
*
*/
module.exports.fromSasDateTime = function (sasDate) {
  var basedate = new Date("January 1, 1960 00:00:00");
  var currdate = sasDate;

  // offsets for UTC and timezones and BST
  var baseOffset = basedate.getTimezoneOffset(); // in minutes

  // convert sas datetime to a current valid javascript date
  var basedateMs  = basedate.getTime(); // in ms
  var currdateMs  = currdate * 1000; // to ms
  var sasDatetime = currdateMs + basedateMs;
  var jsDate      = new Date();
  jsDate.setTime(sasDatetime); // first time to get offset BST daylight savings etc
  var currOffset  = jsDate.getTimezoneOffset(); // adjust for offset in minutes
  var offsetVar   = (baseOffset - currOffset) * 60 * 1000; // difference in milliseconds
  var offsetTime  = sasDatetime - offsetVar; // finding BST and daylight savings
  jsDate.setTime(offsetTime); // update with offset
  return jsDate;
};

module.exports.needToLogin = function(responseObj) {
  var patt = /<form.+action="(.*Logon[^"]*).*>/;
  var matches = patt.exec(responseObj.responseText);
  var newLoginUrl;

  if(!matches) {
    //there's no form, we are in. hooray!
    return false;
  } else {
    var actionUrl = matches[1].replace(/\?.*/, '');
    if(actionUrl.charAt(0) === '/') {
      newLoginUrl = this.hostUrl ? this.hostUrl + actionUrl : actionUrl;
      if(newLoginUrl !== this.loginUrl) {
        this._loginChanged = true;
        this.loginUrl = newLoginUrl;
      }
    } else {
      //relative path

      var lastIndOfSlash = responseObj.responseURL.lastIndexOf('/') + 1;
      //remove everything after the last slash, and everything until the first
      var relativeLoginUrl = responseObj.responseURL.substr(0, lastIndOfSlash).replace(/.*\/{2}[^\/]*/, '') + actionUrl;
      newLoginUrl = this.hostUrl ? this.hostUrl + relativeLoginUrl : relativeLoginUrl;
      if(newLoginUrl !== this.loginUrl) {
        this._loginChanged = true;
        this.loginUrl = newLoginUrl;
      }
    }

    //save parameters from hidden form fields
    var inputs = responseObj.responseText.match(/<input.*"hidden"[^>]*>/g);
    var hiddenFormParams = {};
    if(inputs) {
      //it's new login page if we have these additional parameters
      this._isNewLoginPage = true;
      inputs.forEach(function(inputStr) {
        var valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
        hiddenFormParams[valueMatch[1]] = valueMatch[2];
      });
      this._aditionalLoginParams = hiddenFormParams;
    }

    return true;
  }
};

/*
* Get full program path from metadata root and relative path
*
* @param {string} metadataRoot - Metadata root (path where all programs for the project are located)
* @param {string} sasProgramPath - Sas program path
*
*/
module.exports.getFullProgramPath = function(metadataRoot, sasProgramPath) {
  return metadataRoot ? metadataRoot.replace(/\/?$/, '/') + sasProgramPath.replace(/^\//, '') : sasProgramPath;
};

},{"../error.js":1,"../logs.js":5}],9:[function(require,module,exports){
var h54sError = require('./error.js');
var logs      = require('./logs.js');
var Tables    = require('./tables');
var Files     = require('./files');
var toSasDateTime = require('./tables/utils.js').toSasDateTime;

function validateMacro(macroName) {
  if(macroName.length > 32) {
    throw new h54sError('argumentError', 'Table name too long. Maximum is 32 characters');
  }

  var charCodeAt0 = macroName.charCodeAt(0);
  // validate it starts with A-Z, a-z, or _
  if((charCodeAt0 < 65 || charCodeAt0 > 90) && (charCodeAt0 < 97 || charCodeAt0 > 122) && macroName[0] !== '_') {
    throw new h54sError('argumentError', 'Table name starting with number or special characters');
  }

  for(var i = 0; i < macroName.length; i++) {
    var charCode = macroName.charCodeAt(i);

    if((charCode < 48 || charCode > 57) &&
      (charCode < 65 || charCode > 90) &&
      (charCode < 97 || charCode > 122) &&
      macroName[i] !== '_')
    {
      throw new h54sError('argumentError', 'Table name has unsupported characters');
    }
  }
}

/*
* h54s SAS data object constructor
* @constructor
*
*@param {array|file} data - Table or file added when object is created
*@param {string} macroName - macro name
*@param {number} parameterThreshold - size of data objects sent to SAS
*
*/
function SasData(data, macroName, specs) {
  if(data instanceof Array) {
    this._files = {};
    this.addTable(data, macroName, specs);
  } else if(data instanceof File || data instanceof Blob) {
    Files.call(this, data, macroName);
  } else {
    throw new h54sError('argumentError', 'Data argument wrong type or missing');
  }
}

/*
* Add table to tables object
* @param {array} table - Array of table objects
* @param {string} macroName - Sas macro name
*
*/
SasData.prototype.addTable = function(table, macroName, specs) {
  var isSpecsProvided = !!specs;
  if(table && macroName) {
    if(!(table instanceof Array)) {
      throw new h54sError('argumentError', 'First argument must be array');
    }
    if(typeof macroName !== 'string') {
      throw new h54sError('argumentError', 'Second argument must be string');
    }

    validateMacro(macroName);
  } else {
    throw new h54sError('argumentError', 'Missing arguments');
  }

  if (typeof table !== 'object' || !(table instanceof Array)) {
    throw new h54sError('argumentError', 'Table argument is not an array');
  }

  var key;
  if(specs) {
    if(specs.constructor !== Object) {
      throw new h54sError('argumentError', 'Specs data type wrong. Object expected.');
    }
    for(key in table[0]) {
      if(!specs[key]) {
        throw new h54sError('argumentError', 'Missing columns in specs data.');
      }
    }
    for(key in specs) {
      if(specs[key].constructor !== Object) {
        throw new h54sError('argumentError', 'Wrong column descriptor in specs data.');
      }
      if(!specs[key].colType || !specs[key].colLength) {
        throw new h54sError('argumentError', 'Missing columns in specs descriptor.');
      }
    }
  }

  var i, j, //counters used latter in code
      row, val, type,
      specKeys = [],
      specialChars = ['"', '\\', '/', '\n', '\t', '\f', '\r', '\b'];

  if(!specs) {
    specs = {};

    for (i = 0; i < table.length; i++) {
      row = table[i];

      if(typeof row !== 'object') {
        throw new h54sError('argumentError', 'Table item is not an object');
      }

      for(key in row) {
        if(row.hasOwnProperty(key)) {
          val  = row[key];
          type = typeof val;

          if(specs[key] === undefined) {
            specKeys.push(key);
            specs[key] = {};

            if (type === 'number') {
              if(val < Number.MIN_SAFE_INTEGER || val > Number.MAX_SAFE_INTEGER) {
                logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
              }
              specs[key].colType   = 'num';
              specs[key].colLength = 8;
            } else if (type === 'string' && !(val instanceof Date)) { // straightforward string
              specs[key].colType    = 'string';
              specs[key].colLength  = val.length;
            } else if(val instanceof Date) {
              specs[key].colType   = 'date';
              specs[key].colLength = 8;
            } else if (type === 'object') {
              specs[key].colType   = 'json';
              specs[key].colLength = JSON.stringify(val).length;
            }
          }
        }
      }
    }
  } else {
    specKeys = Object.keys(specs);
  }

  var sasCsv = '';

  // we need two loops - the first one is creating specs and validating
  for (i = 0; i < table.length; i++) {
    row = table[i];
    for(j = 0; j < specKeys.length; j++) {
      key = specKeys[j];
      if(row.hasOwnProperty(key)) {
        val  = row[key];
        type = typeof val;

        if(type === 'number' && isNaN(val)) {
          throw new h54sError('typeError', 'NaN value in one of the values (columns) is not allowed');
        }
        if(val === -Infinity || val === Infinity) {
          throw new h54sError('typeError', val.toString() + ' value in one of the values (columns) is not allowed');
        }
        if(val === true || val === false) {
          throw new h54sError('typeError', 'Boolean value in one of the values (columns) is not allowed');
        }
        if(type === 'string' && val.indexOf('\n') !== -1) {
          throw new h54sError('typeError', 'New line character is not supported');
        }

        // convert null to '.' for numbers and to '' for strings
        if(val === null) {
          if(specs[key].colType === 'string') {
            val = '';
            type = 'string';
          } else if(specs[key].colType === 'num') {
            val = '.';
            type = 'number';
          } else {
            throw new h54sError('typeError', 'Cannot convert null value');
          }
        }


        if ((type === 'number' && specs[key].colType !== 'num' && val !== '.') ||
          (type === 'string' && !(val instanceof Date) && specs[key].colType !== 'string') ||
          (val instanceof Date && specs[key].colType !== 'date') ||
          ((type === 'object' && val.constructor !== Date) && specs[key].colType !== 'json'))
        {
          throw new h54sError('typeError', 'There is a specs mismatch in the array between values (columns) of the same name.');
        } else if(!isSpecsProvided && type === 'string' && specs[key].colLength < val.length) {
          specs[key].colLength = val.length;
        } else if((type === 'string' && specs[key].colLength < val.length) || (type !== 'string' && specs[key].colLength !== 8)) {
          throw new h54sError('typeError', 'There is a specs mismatch in the array between values (columns) of the same name.');
        }

        if (val instanceof Date) {
          val = toSasDateTime(val);
        }

        switch(specs[key].colType) {
          case 'num':
          case 'date':
            sasCsv += val;
            break;
          case 'string':
            sasCsv += '"' + val.replace(/"/g, '""') + '"';
            var colLength = val.length;
            for(var k = 0; k < val.length; k++) {
              if(specialChars.indexOf(val[k]) !== -1) {
                colLength++;
              } else {
                var code = val.charCodeAt(k);
                if(code > 0xffff) {
                  colLength += 3;
                } else if(code > 0x7ff) {
                  colLength += 2;
                } else if(code > 0x7f) {
                  colLength += 1;
                }
              }
            }
            // use maximum value between max previous, current value and 1 (first two can be 0 wich is not supported)
            specs[key].colLength = Math.max(specs[key].colLength, colLength, 1);
            break;
          case 'object':
            sasCsv += '"' + JSON.stringidy(val).replace(/"/g, '""') + '"';
            break;
        }
      }
      // do not insert if it's the last column
      if(j < specKeys.length - 1) {
        sasCsv += ',';
      }
    }
    if(i < table.length - 1) {
      sasCsv += '\n';
    }
  }

  //convert specs to csv with pipes
  var specString = specKeys.map(function(key) {
    return key + ',' + specs[key].colType + ',' + specs[key].colLength;
  }).join('|');

  this._files[macroName] = [
    specString,
    new Blob([sasCsv], {type: 'text/csv;charset=UTF-8'})
  ];
};

SasData.prototype.addFile  = function(file, macroName) {
  Files.prototype.add.call(this, file, macroName);
};

module.exports = SasData;

},{"./error.js":1,"./files":2,"./logs.js":5,"./tables":10,"./tables/utils.js":11}],10:[function(require,module,exports){
var h54sError = require('../error.js');

/*
* h54s tables object constructor
* @constructor
*
*@param {array} table - Table added when object is created
*@param {string} macroName - macro name
*@param {number} parameterThreshold - size of data objects sent to SAS
*
*/
function Tables(table, macroName, parameterThreshold) {
  this._tables = {};
  this._parameterThreshold = parameterThreshold || 30000;

  Tables.prototype.add.call(this, table, macroName);
}

/*
* Add table to tables object
* @param {array} table - Array of table objects
* @param {string} macroName - Sas macro name
*
*/
Tables.prototype.add = function(table, macroName) {
  if(table && macroName) {
    if(!(table instanceof Array)) {
      throw new h54sError('argumentError', 'First argument must be array');
    }
    if(typeof macroName !== 'string') {
      throw new h54sError('argumentError', 'Second argument must be string');
    }
    if(!isNaN(macroName[macroName.length - 1])) {
      throw new h54sError('argumentError', 'Macro name cannot have number at the end');
    }
  } else {
    throw new h54sError('argumentError', 'Missing arguments');
  }

  var result = this._utils.convertTableObject(table, this._parameterThreshold);

  var tableArray = [];
  tableArray.push(JSON.stringify(result.spec));
  for (var numberOfTables = 0; numberOfTables < result.data.length; numberOfTables++) {
    var outString = JSON.stringify(result.data[numberOfTables]);
    tableArray.push(outString);
  }
  this._tables[macroName] = tableArray;
};

Tables.prototype._utils = require('./utils.js');

module.exports = Tables;

},{"../error.js":1,"./utils.js":11}],11:[function(require,module,exports){
var h54sError = require('../error.js');
var logs = require('../logs.js');

/*
* Convert table object to Sas readable object
*
* @param {object} inObject - Object to convert
*
*/
module.exports.convertTableObject = function(inObject, chunkThreshold) {
  var self            = this;

  if(chunkThreshold > 30000) {
    console.warn('You should not set threshold larger than 30kb because of the SAS limitations');
  }

  // first check that the object is an array
  if (typeof (inObject) !== 'object') {
    throw new h54sError('argumentError', 'The parameter passed to checkAndGetTypeObject is not an object');
  }

  var arrayLength = inObject.length;
  if (typeof (arrayLength) !== 'number') {
    throw new h54sError('argumentError', 'The parameter passed to checkAndGetTypeObject does not have a valid length and is most likely not an array');
  }

  var existingCols = {}; // this is just to make lookup easier rather than traversing array each time. Will transform after

  // function checkAndSetArray - this will check an inObject current key against the existing typeArray and either return -1 if there
  // is a type mismatch or add an element and update/increment the length if needed

  function checkAndIncrement(colSpec) {
    if (typeof (existingCols[colSpec.colName]) === 'undefined') {
      existingCols[colSpec.colName]           = {};
      existingCols[colSpec.colName].colName   = colSpec.colName;
      existingCols[colSpec.colName].colType   = colSpec.colType;
      existingCols[colSpec.colName].colLength = colSpec.colLength > 0 ? colSpec.colLength : 1;
      return 0; // all ok
    }
    // check type match
    if (existingCols[colSpec.colName].colType !== colSpec.colType) {
      return -1; // there is a fudge in the typing
    }
    if (existingCols[colSpec.colName].colLength < colSpec.colLength) {
      existingCols[colSpec.colName].colLength = colSpec.colLength > 0 ? colSpec.colLength : 1; // increment the max length of this column
      return 0;
    }
  }
  var chunkArrayCount         = 0; // this is for keeping tabs on how long the current array string would be
  var targetArray             = []; // this is the array of target arrays
  var currentTarget           = 0;
  targetArray[currentTarget]  = [];
  var j                       = 0;
  for (var i = 0; i < inObject.length; i++) {
    targetArray[currentTarget][j] = {};
    var chunkRowCount             = 0;

    for (var key in inObject[i]) {
      var thisSpec  = {};
      var thisValue = inObject[i][key];

      //skip undefined values
      if(thisValue === undefined || thisValue === null) {
        continue;
      }

      //throw an error if there's NaN value
      if(typeof thisValue === 'number' && isNaN(thisValue)) {
        throw new h54sError('typeError', 'NaN value in one of the values (columns) is not allowed');
      }

      if(thisValue === -Infinity || thisValue === Infinity) {
        throw new h54sError('typeError', thisValue.toString() + ' value in one of the values (columns) is not allowed');
      }

      if(thisValue === true || thisValue === false) {
        throw new h54sError('typeError', 'Boolean value in one of the values (columns) is not allowed');
      }

      // get type... if it is an object then convert it to json and store as a string
      var thisType  = typeof (thisValue);

      if (thisType === 'number') { // straightforward number
        if(thisValue < Number.MIN_SAFE_INTEGER || thisValue > Number.MAX_SAFE_INTEGER) {
          logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
        }
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'num';
        thisSpec.colLength                  = 8;
        thisSpec.encodedLength              = thisValue.toString().length;
        targetArray[currentTarget][j][key]  = thisValue;
      } else if (thisType === 'string') {
        thisSpec.colName    = key;
        thisSpec.colType    = 'string';
        thisSpec.colLength  = thisValue.length;

        if (thisValue === "") {
          targetArray[currentTarget][j][key] = " ";
        } else {
          targetArray[currentTarget][j][key] = encodeURIComponent(thisValue).replace(/'/g, '%27');
        }
        thisSpec.encodedLength = targetArray[currentTarget][j][key].length;
      } else if(thisValue instanceof Date) {
        throw new h54sError('typeError', 'Date type not supported. Please use h54s.toSasDateTime function to convert it');
      } else if (thisType == 'object') {
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'json';
        thisSpec.colLength                  = JSON.stringify(thisValue).length;
        targetArray[currentTarget][j][key]  = encodeURIComponent(JSON.stringify(thisValue)).replace(/'/g, '%27');
        thisSpec.encodedLength              = targetArray[currentTarget][j][key].length;
      }

      chunkRowCount = chunkRowCount + 6 + key.length + thisSpec.encodedLength;

      if (checkAndIncrement(thisSpec) == -1) {
        throw new h54sError('typeError', 'There is a type mismatch in the array between values (columns) of the same name.');
      }
    }

    //remove last added row if it's empty
    if(Object.keys(targetArray[currentTarget][j]).length === 0) {
      targetArray[currentTarget].splice(j, 1);
      continue;
    }

    if (chunkRowCount > chunkThreshold) {
      throw new h54sError('argumentError', 'Row ' + j + ' exceeds size limit of 32kb');
    } else if(chunkArrayCount + chunkRowCount > chunkThreshold) {
      //create new array if this one is full and move the last item to the new array
      var lastRow = targetArray[currentTarget].pop(); // get rid of that last row
      currentTarget++; // move onto the next array
      targetArray[currentTarget]  = [lastRow]; // make it an array
      j                           = 0; // initialise new row counter for new array - it will be incremented at the end of the function
      chunkArrayCount             = chunkRowCount; // this is the new chunk max size
    } else {
      chunkArrayCount = chunkArrayCount + chunkRowCount;
    }
    j++;
  }

  // reformat existingCols into an array so sas can parse it;
  var specArray = [];
  for (var k in existingCols) {
    specArray.push(existingCols[k]);
  }
  return {
    spec:       specArray,
    data:       targetArray,
    jsonLength: chunkArrayCount
  }; // the spec will be the macro[0], with the data split into arrays of macro[1-n]
  // means in terms of dojo xhr object at least they need to go into the same array
};

/*
* Convert javascript date to sas time
*
* @param {object} jsDate - javascript Date object
*
*/
module.exports.toSasDateTime = function (jsDate) {
  var basedate = new Date("January 1, 1960 00:00:00");
  var currdate = jsDate;

  // offsets for UTC and timezones and BST
  var baseOffset = basedate.getTimezoneOffset(); // in minutes
  var currOffset = currdate.getTimezoneOffset(); // in minutes

  // convert currdate to a sas datetime
  var offsetSecs    = (currOffset - baseOffset) * 60; // offsetDiff is in minutes to start with
  var baseDateSecs  = basedate.getTime() / 1000; // get rid of ms
  var currdateSecs  = currdate.getTime() / 1000; // get rid of ms
  var sasDatetime   = Math.round(currdateSecs - baseDateSecs - offsetSecs); // adjust

  return sasDatetime;
};

},{"../error.js":1,"../logs.js":5}]},{},[3])(3)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvZmlsZXMvaW5kZXguanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9pbmRleC5qcyIsInNyYy9tZXRob2RzL3V0aWxzLmpzIiwic3JjL3Nhc0RhdGEuanMiLCJzcmMvdGFibGVzL2luZGV4LmpzIiwic3JjL3RhYmxlcy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuKiBoNTRzIGVycm9yIGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gRXJyb3IgdHlwZVxuKkBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlIC0gRXJyb3IgbWVzc2FnZVxuKkBwYXJhbSB7c3RyaW5nfSBzdGF0dXMgLSBFcnJvciBzdGF0dXMgcmV0dXJuZWQgZnJvbSBTQVNcbipcbiovXG5mdW5jdGlvbiBoNTRzRXJyb3IodHlwZSwgbWVzc2FnZSwgc3RhdHVzKSB7XG4gIGlmKEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKSB7XG4gICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcyk7XG4gIH1cbiAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgdGhpcy50eXBlICAgID0gdHlwZTtcbiAgdGhpcy5zdGF0dXMgID0gc3RhdHVzO1xufVxuXG5oNTRzRXJyb3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShFcnJvci5wcm90b3R5cGUsIHtcbiAgY29uc3RydWN0b3I6IHtcbiAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICB2YWx1ZTogaDU0c0Vycm9yXG4gIH0sXG4gIG5hbWU6IHtcbiAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICB2YWx1ZTogJ2g1NHNFcnJvcidcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gaDU0c0Vycm9yO1xuIiwidmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5cbi8qXG4qIGg1NHMgU0FTIEZpbGVzIG9iamVjdCBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge2ZpbGV9IGZpbGUgLSBGaWxlIGFkZGVkIHdoZW4gb2JqZWN0IGlzIGNyZWF0ZWRcbipAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gbWFjcm8gbmFtZVxuKlxuKi9cbmZ1bmN0aW9uIEZpbGVzKGZpbGUsIG1hY3JvTmFtZSkge1xuICB0aGlzLl9maWxlcyA9IHt9O1xuXG4gIEZpbGVzLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCBmaWxlLCBtYWNyb05hbWUpO1xufVxuXG4vKlxuKiBBZGQgZmlsZSB0byBmaWxlcyBvYmplY3RcbiogQHBhcmFtIHtmaWxlfSBmaWxlIC0gSW5zdGFuY2Ugb2YgSmF2YVNjcmlwdCBGaWxlIG9iamVjdFxuKiBAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gU2FzIG1hY3JvIG5hbWVcbipcbiovXG5GaWxlcy5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24oZmlsZSwgbWFjcm9OYW1lKSB7XG4gIGlmKGZpbGUgJiYgbWFjcm9OYW1lKSB7XG4gICAgaWYoIShmaWxlIGluc3RhbmNlb2YgRmlsZSB8fCBmaWxlIGluc3RhbmNlb2YgQmxvYikpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgYXJndW1lbnQgbXVzdCBiZSBpbnN0YW5jZSBvZiBGaWxlIG9iamVjdCcpO1xuICAgIH1cbiAgICBpZih0eXBlb2YgbWFjcm9OYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdTZWNvbmQgYXJndW1lbnQgbXVzdCBiZSBzdHJpbmcnKTtcbiAgICB9XG4gICAgaWYoIWlzTmFOKG1hY3JvTmFtZVttYWNyb05hbWUubGVuZ3RoIC0gMV0pKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01hY3JvIG5hbWUgY2Fubm90IGhhdmUgbnVtYmVyIGF0IHRoZSBlbmQnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGFyZ3VtZW50cycpO1xuICB9XG5cbiAgdGhpcy5fZmlsZXNbbWFjcm9OYW1lXSA9IFtcbiAgICAnRklMRScsXG4gICAgZmlsZVxuICBdO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBGaWxlcztcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuL2Vycm9yLmpzJyk7XG5cbi8qXG4qIFJlcHJlc2VudHMgaHRtbDUgZm9yIHNhcyBhZGFwdGVyXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7b2JqZWN0fSBjb25maWcgLSBhZGFwdGVyIGNvbmZpZyBvYmplY3QsIHdpdGgga2V5cyBsaWtlIHVybCwgZGVidWcsIGV0Yy5cbipcbiovXG52YXIgaDU0cyA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oY29uZmlnKSB7XG5cbiAgLy9kZWZhdWx0IGNvbmZpZyB2YWx1ZXNcbiAgdGhpcy5tYXhYaHJSZXRyaWVzICAgICAgICA9IDU7XG4gIHRoaXMudXJsICAgICAgICAgICAgICAgICAgPSBcIi9TQVNTdG9yZWRQcm9jZXNzL2RvXCI7XG4gIHRoaXMuZGVidWcgICAgICAgICAgICAgICAgPSBmYWxzZTtcbiAgdGhpcy5sb2dpblVybCAgICAgICAgICAgICA9ICcvU0FTTG9nb24vTG9nb24uZG8nO1xuICB0aGlzLnJldHJ5QWZ0ZXJMb2dpbiAgICAgID0gdHJ1ZTtcbiAgdGhpcy5hamF4VGltZW91dCAgICAgICAgICA9IDMwMDAwO1xuICB0aGlzLnVzZU11bHRpcGFydEZvcm1EYXRhID0gdHJ1ZTtcbiAgdGhpcy5SRVNUYXV0aCAgICAgICAgICAgICA9IGZhbHNlO1xuICB0aGlzLlJFU1RhdXRoTG9naW5VcmwgICAgID0gJy9TQVNMb2dvbi92MS90aWNrZXRzJztcblxuICB0aGlzLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcyA9IFtdO1xuICB0aGlzLl9wZW5kaW5nQ2FsbHMgPSBbXTtcbiAgdGhpcy5fYWpheCA9IHJlcXVpcmUoJy4vbWV0aG9kcy9hamF4LmpzJykoKTtcblxuICBfc2V0Q29uZmlnLmNhbGwodGhpcywgY29uZmlnKTtcblxuICAvL292ZXJyaWRlIHdpdGggcmVtb3RlIGlmIHNldFxuICBpZihjb25maWcgJiYgY29uZmlnLmlzUmVtb3RlQ29uZmlnKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdGhpcy5fZGlzYWJsZUNhbGxzID0gdHJ1ZTtcblxuICAgIC8vICdoNTRzQ29uZmlnLmpzb24nIGlzIGZvciB0aGUgdGVzdGluZyB3aXRoIGthcm1hXG4gICAgLy9yZXBsYWNlZCB3aXRoIGd1bHAgaW4gZGV2IGJ1aWxkXG4gICAgdGhpcy5fYWpheC5nZXQoJ2g1NHNDb25maWcuanNvbicpLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgICB2YXIgcmVtb3RlQ29uZmlnID0gSlNPTi5wYXJzZShyZXMucmVzcG9uc2VUZXh0KTtcblxuICAgICAgZm9yKHZhciBrZXkgaW4gcmVtb3RlQ29uZmlnKSB7XG4gICAgICAgIGlmKHJlbW90ZUNvbmZpZy5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIGNvbmZpZ1trZXldID09PSB1bmRlZmluZWQgJiYga2V5ICE9PSAnaXNSZW1vdGVDb25maWcnKSB7XG4gICAgICAgICAgY29uZmlnW2tleV0gPSByZW1vdGVDb25maWdba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBfc2V0Q29uZmlnLmNhbGwoc2VsZiwgY29uZmlnKTtcblxuICAgICAgLy9leGVjdXRlIGNhbGxiYWNrcyB3aGVuIHdlIGhhdmUgcmVtb3RlIGNvbmZpZ1xuICAgICAgLy9ub3RlIHRoYXQgcmVtb3RlIGNvbmlmZyBpcyBtZXJnZWQgd2l0aCBpbnN0YW5jZSBjb25maWdcbiAgICAgIGZvcih2YXIgaSA9IDAsIG4gPSBzZWxmLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgdmFyIGZuID0gc2VsZi5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3NbaV07XG4gICAgICAgIGZuKCk7XG4gICAgICB9XG5cbiAgICAgIC8vZXhlY3V0ZSBzYXMgY2FsbHMgZGlzYWJsZWQgd2hpbGUgd2FpdGluZyBmb3IgdGhlIGNvbmZpZ1xuICAgICAgc2VsZi5fZGlzYWJsZUNhbGxzID0gZmFsc2U7XG4gICAgICB3aGlsZShzZWxmLl9wZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xuICAgICAgICB2YXIgcGVuZGluZ0NhbGwgPSBzZWxmLl9wZW5kaW5nQ2FsbHMuc2hpZnQoKTtcbiAgICAgICAgdmFyIHNhc1Byb2dyYW0gID0gcGVuZGluZ0NhbGwuc2FzUHJvZ3JhbTtcbiAgICAgICAgdmFyIGNhbGxiYWNrICAgID0gcGVuZGluZ0NhbGwuY2FsbGJhY2s7XG4gICAgICAgIHZhciBwYXJhbXMgICAgICA9IHBlbmRpbmdDYWxsLnBhcmFtcztcblxuICAgICAgICAvL3VwZGF0ZSBwcm9ncmFtIHdpdGggbWV0YWRhdGFSb290IGlmIGl0J3Mgbm90IHNldFxuICAgICAgICBpZihzZWxmLm1ldGFkYXRhUm9vdCAmJiBwZW5kaW5nQ2FsbC5wYXJhbXMuX3Byb2dyYW0uaW5kZXhPZihzZWxmLm1ldGFkYXRhUm9vdCkgPT09IC0xKSB7XG4gICAgICAgICAgcGVuZGluZ0NhbGwucGFyYW1zLl9wcm9ncmFtID0gc2VsZi5tZXRhZGF0YVJvb3QucmVwbGFjZSgvXFwvPyQvLCAnLycpICsgcGVuZGluZ0NhbGwucGFyYW1zLl9wcm9ncmFtLnJlcGxhY2UoL15cXC8vLCAnJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG4gICAgICAgIHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblxuICAgICAgICBzZWxmLmNhbGwoc2FzUHJvZ3JhbSwgbnVsbCwgY2FsbGJhY2ssIHBhcmFtcyk7XG4gICAgICB9XG4gICAgfSkuZXJyb3IoZnVuY3Rpb24gKGVycikge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYWpheEVycm9yJywgJ1JlbW90ZSBjb25maWcgZmlsZSBjYW5ub3QgYmUgbG9hZGVkLiBIdHRwIHN0YXR1cyBjb2RlOiAnICsgZXJyLnN0YXR1cyk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBwcml2YXRlIGZ1bmN0aW9uIHRvIHNldCBoNTRzIGluc3RhbmNlIHByb3BlcnRpZXNcbiAgZnVuY3Rpb24gX3NldENvbmZpZyhjb25maWcpIHtcbiAgICBpZighY29uZmlnKSB7XG4gICAgICB0aGlzLl9hamF4LnNldFRpbWVvdXQodGhpcy5hamF4VGltZW91dCk7XG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIGlmKHR5cGVvZiBjb25maWcgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IHBhcmFtZXRlciBzaG91bGQgYmUgY29uZmlnIG9iamVjdCcpO1xuICAgIH1cblxuICAgIC8vbWVyZ2UgY29uZmlnIG9iamVjdCBmcm9tIHBhcmFtZXRlciB3aXRoIHRoaXNcbiAgICBmb3IodmFyIGtleSBpbiBjb25maWcpIHtcbiAgICAgIGlmKGNvbmZpZy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgIGlmKChrZXkgPT09ICd1cmwnIHx8IGtleSA9PT0gJ2xvZ2luVXJsJykgJiYgY29uZmlnW2tleV0uY2hhckF0KDApICE9PSAnLycpIHtcbiAgICAgICAgICBjb25maWdba2V5XSA9ICcvJyArIGNvbmZpZ1trZXldO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNba2V5XSA9IGNvbmZpZ1trZXldO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vaWYgc2VydmVyIGlzIHJlbW90ZSB1c2UgdGhlIGZ1bGwgc2VydmVyIHVybFxuICAgIC8vTk9URTogdGhpcyBpcyBub3QgcGVybWl0ZWQgYnkgdGhlIHNhbWUtb3JpZ2luIHBvbGljeVxuICAgIGlmKGNvbmZpZy5ob3N0VXJsKSB7XG4gICAgICBpZihjb25maWcuaG9zdFVybC5jaGFyQXQoY29uZmlnLmhvc3RVcmwubGVuZ3RoIC0gMSkgPT09ICcvJykge1xuICAgICAgICBjb25maWcuaG9zdFVybCA9IGNvbmZpZy5ob3N0VXJsLnNsaWNlKDAsIC0xKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuaG9zdFVybCAgICAgICAgICA9IGNvbmZpZy5ob3N0VXJsO1xuICAgICAgdGhpcy51cmwgICAgICAgICAgICAgID0gY29uZmlnLmhvc3RVcmwgKyB0aGlzLnVybDtcbiAgICAgIHRoaXMubG9naW5VcmwgICAgICAgICA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy5sb2dpblVybDtcbiAgICAgIHRoaXMuUkVTVGF1dGhMb2dpblVybCA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy5SRVNUYXV0aExvZ2luVXJsO1xuICAgIH1cblxuICAgIHRoaXMuX2FqYXguc2V0VGltZW91dCh0aGlzLmFqYXhUaW1lb3V0KTtcbiAgfVxufTtcblxuLy9yZXBsYWNlZCB3aXRoIGd1bHBcbmg1NHMudmVyc2lvbiA9ICdfX3ZlcnNpb25fXyc7XG5cblxuaDU0cy5wcm90b3R5cGUgPSByZXF1aXJlKCcuL21ldGhvZHMnKTtcblxuaDU0cy5UYWJsZXMgPSByZXF1aXJlKCcuL3RhYmxlcycpO1xuaDU0cy5GaWxlcyA9IHJlcXVpcmUoJy4vZmlsZXMnKTtcbmg1NHMuU2FzRGF0YSA9IHJlcXVpcmUoJy4vc2FzRGF0YS5qcycpO1xuXG5oNTRzLmZyb21TYXNEYXRlVGltZSA9IHJlcXVpcmUoJy4vbWV0aG9kcy91dGlscy5qcycpLmZyb21TYXNEYXRlVGltZTtcbmg1NHMudG9TYXNEYXRlVGltZSA9IHJlcXVpcmUoJy4vdGFibGVzL3V0aWxzLmpzJykudG9TYXNEYXRlVGltZTtcblxuLy9zZWxmIGludm9rZWQgZnVuY3Rpb24gbW9kdWxlXG5yZXF1aXJlKCcuL2llX3BvbHlmaWxscy5qcycpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgaWYgKCFPYmplY3QuY3JlYXRlKSB7XG4gICAgT2JqZWN0LmNyZWF0ZSA9IGZ1bmN0aW9uKHByb3RvLCBwcm9wcykge1xuICAgICAgaWYgKHR5cGVvZiBwcm9wcyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICB0aHJvdyBcIlRoZSBtdWx0aXBsZS1hcmd1bWVudCB2ZXJzaW9uIG9mIE9iamVjdC5jcmVhdGUgaXMgbm90IHByb3ZpZGVkIGJ5IHRoaXMgYnJvd3NlciBhbmQgY2Fubm90IGJlIHNoaW1tZWQuXCI7XG4gICAgICB9XG4gICAgICBmdW5jdGlvbiBjdG9yKCkgeyB9XG4gICAgICBjdG9yLnByb3RvdHlwZSA9IHByb3RvO1xuICAgICAgcmV0dXJuIG5ldyBjdG9yKCk7XG4gICAgfTtcbiAgfVxuXG5cbiAgLy8gRnJvbSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9PYmplY3Qva2V5c1xuICBpZiAoIU9iamVjdC5rZXlzKSB7XG4gICAgT2JqZWN0LmtleXMgPSAoZnVuY3Rpb24gKCkge1xuICAgICAgJ3VzZSBzdHJpY3QnO1xuICAgICAgdmFyIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSxcbiAgICAgICAgICBoYXNEb250RW51bUJ1ZyA9ICEoe3RvU3RyaW5nOiBudWxsfSkucHJvcGVydHlJc0VudW1lcmFibGUoJ3RvU3RyaW5nJyksXG4gICAgICAgICAgZG9udEVudW1zID0gW1xuICAgICAgICAgICAgJ3RvU3RyaW5nJyxcbiAgICAgICAgICAgICd0b0xvY2FsZVN0cmluZycsXG4gICAgICAgICAgICAndmFsdWVPZicsXG4gICAgICAgICAgICAnaGFzT3duUHJvcGVydHknLFxuICAgICAgICAgICAgJ2lzUHJvdG90eXBlT2YnLFxuICAgICAgICAgICAgJ3Byb3BlcnR5SXNFbnVtZXJhYmxlJyxcbiAgICAgICAgICAgICdjb25zdHJ1Y3RvcidcbiAgICAgICAgICBdLFxuICAgICAgICAgIGRvbnRFbnVtc0xlbmd0aCA9IGRvbnRFbnVtcy5sZW5ndGg7XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbiAob2JqKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JyAmJiAodHlwZW9mIG9iaiAhPT0gJ2Z1bmN0aW9uJyB8fCBvYmogPT09IG51bGwpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignT2JqZWN0LmtleXMgY2FsbGVkIG9uIG5vbi1vYmplY3QnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByZXN1bHQgPSBbXSwgcHJvcCwgaTtcblxuICAgICAgICBmb3IgKHByb3AgaW4gb2JqKSB7XG4gICAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKSkge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2gocHJvcCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGhhc0RvbnRFbnVtQnVnKSB7XG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGRvbnRFbnVtc0xlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGRvbnRFbnVtc1tpXSkpIHtcbiAgICAgICAgICAgICAgcmVzdWx0LnB1c2goZG9udEVudW1zW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH07XG4gICAgfSgpKTtcbiAgfVxuXG4gIC8vIEZyb20gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvQXJyYXkvbGFzdEluZGV4T2ZcbiAgaWYgKCFBcnJheS5wcm90b3R5cGUubGFzdEluZGV4T2YpIHtcbiAgICBBcnJheS5wcm90b3R5cGUubGFzdEluZGV4T2YgPSBmdW5jdGlvbihzZWFyY2hFbGVtZW50IC8qLCBmcm9tSW5kZXgqLykge1xuICAgICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgICBpZiAodGhpcyA9PT0gdm9pZCAwIHx8IHRoaXMgPT09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigpO1xuICAgICAgfVxuXG4gICAgICB2YXIgbiwgayxcbiAgICAgICAgdCA9IE9iamVjdCh0aGlzKSxcbiAgICAgICAgbGVuID0gdC5sZW5ndGggPj4+IDA7XG4gICAgICBpZiAobGVuID09PSAwKSB7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICAgIH1cblxuICAgICAgbiA9IGxlbiAtIDE7XG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgbiA9IE51bWJlcihhcmd1bWVudHNbMV0pO1xuICAgICAgICBpZiAobiAhPSBuKSB7XG4gICAgICAgICAgbiA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobiAhPT0gMCAmJiBuICE9ICgxIC8gMCkgJiYgbiAhPSAtKDEgLyAwKSkge1xuICAgICAgICAgIG4gPSAobiA+IDAgfHwgLTEpICogTWF0aC5mbG9vcihNYXRoLmFicyhuKSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yIChrID0gbiA+PSAwID8gTWF0aC5taW4obiwgbGVuIC0gMSkgOiBsZW4gLSBNYXRoLmFicyhuKTsgayA+PSAwOyBrLS0pIHtcbiAgICAgICAgaWYgKGsgaW4gdCAmJiB0W2tdID09PSBzZWFyY2hFbGVtZW50KSB7XG4gICAgICAgICAgcmV0dXJuIGs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiAtMTtcbiAgICB9O1xuICB9XG59KCk7XG4iLCJ2YXIgbG9ncyA9IHtcbiAgYXBwbGljYXRpb25Mb2dzOiBbXSxcbiAgZGVidWdEYXRhOiBbXSxcbiAgc2FzRXJyb3JzOiBbXSxcbiAgZmFpbGVkUmVxdWVzdHM6IFtdXG59O1xuXG52YXIgbGltaXRzID0ge1xuICBhcHBsaWNhdGlvbkxvZ3M6IDEwMCxcbiAgZGVidWdEYXRhOiAyMCxcbiAgZmFpbGVkUmVxdWVzdHM6IDIwLFxuICBzYXNFcnJvcnM6IDEwMFxufTtcblxubW9kdWxlLmV4cG9ydHMuZ2V0ID0ge1xuICBnZXRTYXNFcnJvcnM6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLnNhc0Vycm9ycztcbiAgfSxcbiAgZ2V0QXBwbGljYXRpb25Mb2dzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5hcHBsaWNhdGlvbkxvZ3M7XG4gIH0sXG4gIGdldERlYnVnRGF0YTogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3MuZGVidWdEYXRhO1xuICB9LFxuICBnZXRGYWlsZWRSZXF1ZXN0czogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3MuZmFpbGVkUmVxdWVzdHM7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzLmNsZWFyID0ge1xuICBjbGVhckFwcGxpY2F0aW9uTG9nczogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5hcHBsaWNhdGlvbkxvZ3Muc3BsaWNlKDAsIGxvZ3MuYXBwbGljYXRpb25Mb2dzLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyRGVidWdEYXRhOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLmRlYnVnRGF0YS5zcGxpY2UoMCwgbG9ncy5kZWJ1Z0RhdGEubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJTYXNFcnJvcnM6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3Muc2FzRXJyb3JzLnNwbGljZSgwLCBsb2dzLnNhc0Vycm9ycy5sZW5ndGgpO1xuICB9LFxuICBjbGVhckZhaWxlZFJlcXVlc3RzOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLmZhaWxlZFJlcXVlc3RzLnNwbGljZSgwLCBsb2dzLmZhaWxlZFJlcXVlc3RzLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyQWxsTG9nczogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5jbGVhckFwcGxpY2F0aW9uTG9ncygpO1xuICAgIHRoaXMuY2xlYXJEZWJ1Z0RhdGEoKTtcbiAgICB0aGlzLmNsZWFyU2FzRXJyb3JzKCk7XG4gICAgdGhpcy5jbGVhckZhaWxlZFJlcXVlc3RzKCk7XG4gIH1cbn07XG5cbi8qXG4qIEFkZHMgYXBwbGljYXRpb24gbG9ncyB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGRBcHBsaWNhdGlvbkxvZyA9IGZ1bmN0aW9uKG1lc3NhZ2UsIHNhc1Byb2dyYW0pIHtcbiAgaWYobWVzc2FnZSA9PT0gJ2JsYW5rJykge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgbG9nID0ge1xuICAgIG1lc3NhZ2U6ICAgIG1lc3NhZ2UsXG4gICAgdGltZTogICAgICAgbmV3IERhdGUoKSxcbiAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtXG4gIH07XG4gIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnB1c2gobG9nKTtcblxuICBpZihsb2dzLmFwcGxpY2F0aW9uTG9ncy5sZW5ndGggPiBsaW1pdHMuYXBwbGljYXRpb25Mb2dzKSB7XG4gICAgbG9ncy5hcHBsaWNhdGlvbkxvZ3Muc2hpZnQoKTtcbiAgfVxufTtcblxuLypcbiogQWRkcyBkZWJ1ZyBkYXRhIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZERlYnVnRGF0YSA9IGZ1bmN0aW9uKGh0bWxEYXRhLCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0sIHBhcmFtcykge1xuICBsb2dzLmRlYnVnRGF0YS5wdXNoKHtcbiAgICBkZWJ1Z0h0bWw6ICBodG1sRGF0YSxcbiAgICBkZWJ1Z1RleHQ6ICBkZWJ1Z1RleHQsXG4gICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbSxcbiAgICBwYXJhbXM6ICAgICBwYXJhbXMsXG4gICAgdGltZTogICAgICAgbmV3IERhdGUoKVxuICB9KTtcblxuICBpZihsb2dzLmRlYnVnRGF0YS5sZW5ndGggPiBsaW1pdHMuZGVidWdEYXRhKSB7XG4gICAgbG9ncy5kZWJ1Z0RhdGEuc2hpZnQoKTtcbiAgfVxufTtcblxuLypcbiogQWRkcyBmYWlsZWQgcmVxdWVzdHMgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkRmFpbGVkUmVxdWVzdCA9IGZ1bmN0aW9uKHJlc3BvbnNlVGV4dCwgZGVidWdUZXh0LCBzYXNQcm9ncmFtKSB7XG4gIGxvZ3MuZmFpbGVkUmVxdWVzdHMucHVzaCh7XG4gICAgcmVzcG9uc2VIdG1sOiByZXNwb25zZVRleHQsXG4gICAgcmVzcG9uc2VUZXh0OiBkZWJ1Z1RleHQsXG4gICAgc2FzUHJvZ3JhbTogICBzYXNQcm9ncmFtLFxuICAgIHRpbWU6ICAgICAgICAgbmV3IERhdGUoKVxuICB9KTtcblxuICAvL21heCAyMCBmYWlsZWQgcmVxdWVzdHNcbiAgaWYobG9ncy5mYWlsZWRSZXF1ZXN0cy5sZW5ndGggPiBsaW1pdHMuZmFpbGVkUmVxdWVzdHMpIHtcbiAgICBsb2dzLmZhaWxlZFJlcXVlc3RzLnNoaWZ0KCk7XG4gIH1cbn07XG5cbi8qXG4qIEFkZHMgU0FTIGVycm9ycyB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGRTYXNFcnJvcnMgPSBmdW5jdGlvbihlcnJvcnMpIHtcbiAgbG9ncy5zYXNFcnJvcnMgPSBsb2dzLnNhc0Vycm9ycy5jb25jYXQoZXJyb3JzKTtcblxuICB3aGlsZShsb2dzLnNhc0Vycm9ycy5sZW5ndGggPiBsaW1pdHMuc2FzRXJyb3JzKSB7XG4gICAgbG9ncy5zYXNFcnJvcnMuc2hpZnQoKTtcbiAgfVxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gIHZhciB0aW1lb3V0ID0gMzAwMDA7XG4gIHZhciB0aW1lb3V0SGFuZGxlO1xuXG4gIHZhciB4aHIgPSBmdW5jdGlvbih0eXBlLCB1cmwsIGRhdGEsIG11bHRpcGFydEZvcm1EYXRhKSB7XG4gICAgdmFyIG1ldGhvZHMgPSB7XG4gICAgICBzdWNjZXNzOiBmdW5jdGlvbigpIHt9LFxuICAgICAgZXJyb3I6ICAgZnVuY3Rpb24oKSB7fVxuICAgIH07XG4gICAgdmFyIFhIUiAgICAgPSBYTUxIdHRwUmVxdWVzdCB8fCBBY3RpdmVYT2JqZWN0O1xuICAgIHZhciByZXF1ZXN0ID0gbmV3IFhIUignTVNYTUwyLlhNTEhUVFAuMy4wJyk7XG5cbiAgICByZXF1ZXN0Lm9wZW4odHlwZSwgdXJsLCB0cnVlKTtcblxuICAgIC8vbXVsdGlwYXJ0L2Zvcm0tZGF0YSBpcyBzZXQgYXV0b21hdGljYWxseSBzbyBubyBuZWVkIGZvciBlbHNlIGJsb2NrXG4gICAgaWYoIW11bHRpcGFydEZvcm1EYXRhKSB7XG4gICAgICByZXF1ZXN0LnNldFJlcXVlc3RIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnKTtcbiAgICB9XG4gICAgcmVxdWVzdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAocmVxdWVzdC5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlKTtcbiAgICAgICAgaWYgKHJlcXVlc3Quc3RhdHVzID49IDIwMCAmJiByZXF1ZXN0LnN0YXR1cyA8IDMwMCkge1xuICAgICAgICAgIG1ldGhvZHMuc3VjY2Vzcy5jYWxsKG1ldGhvZHMsIHJlcXVlc3QpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1ldGhvZHMuZXJyb3IuY2FsbChtZXRob2RzLCByZXF1ZXN0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICBpZih0aW1lb3V0ID4gMCkge1xuICAgICAgdGltZW91dEhhbmRsZSA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlcXVlc3QuYWJvcnQoKTtcbiAgICAgIH0sIHRpbWVvdXQpO1xuICAgIH1cblxuICAgIHJlcXVlc3Quc2VuZChkYXRhKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgbWV0aG9kcy5zdWNjZXNzID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfSxcbiAgICAgIGVycm9yOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgbWV0aG9kcy5lcnJvciA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cbiAgICB9O1xuICB9O1xuXG4gIHZhciBzZXJpYWxpemUgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgc3RyID0gW107XG4gICAgZm9yKHZhciBwIGluIG9iaikge1xuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICBpZihvYmpbcF0gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgIGZvcih2YXIgaSA9IDAsIG4gPSBvYmpbcF0ubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF1baV0pKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RyLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KHApICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQob2JqW3BdKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN0ci5qb2luKFwiJlwiKTtcbiAgfTtcblxuICB2YXIgY3JlYXRlTXVsdGlwYXJ0Rm9ybURhdGFQYXlsb2FkID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGRhdGEgPSBuZXcgRm9ybURhdGEoKTtcbiAgICBmb3IodmFyIHAgaW4gb2JqKSB7XG4gICAgICBpZihvYmouaGFzT3duUHJvcGVydHkocCkpIHtcbiAgICAgICAgaWYob2JqW3BdIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICBmb3IodmFyIGkgPSAwLCBuID0gb2JqW3BdLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgZGF0YS5hcHBlbmQocCwgb2JqW3BdW2ldKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGF0YS5hcHBlbmQocCwgb2JqW3BdKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfTtcblxuICByZXR1cm4ge1xuICAgIGdldDogZnVuY3Rpb24odXJsLCBkYXRhKSB7XG4gICAgICB2YXIgZGF0YVN0cjtcbiAgICAgIGlmKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICBkYXRhU3RyID0gc2VyaWFsaXplKGRhdGEpO1xuICAgICAgfVxuICAgICAgdmFyIHVybFdpdGhQYXJhbXMgPSBkYXRhU3RyID8gKHVybCArICc/JyArIGRhdGFTdHIpIDogdXJsO1xuICAgICAgcmV0dXJuIHhocignR0VUJywgdXJsV2l0aFBhcmFtcyk7XG4gICAgfSxcbiAgICBwb3N0OiBmdW5jdGlvbih1cmwsIGRhdGEsIG11bHRpcGFydEZvcm1EYXRhKSB7XG4gICAgICB2YXIgcGF5bG9hZDtcbiAgICAgIGlmKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZihtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgICAgICAgIHBheWxvYWQgPSBjcmVhdGVNdWx0aXBhcnRGb3JtRGF0YVBheWxvYWQoZGF0YSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGF5bG9hZCA9IHNlcmlhbGl6ZShkYXRhKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHhocignUE9TVCcsIHVybCwgcGF5bG9hZCwgbXVsdGlwYXJ0Rm9ybURhdGEpO1xuICAgIH0sXG4gICAgc2V0VGltZW91dDogZnVuY3Rpb24odCkge1xuICAgICAgdGltZW91dCA9IHQ7XG4gICAgfVxuICB9O1xufTtcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xudmFyIGxvZ3MgPSByZXF1aXJlKCcuLi9sb2dzLmpzJyk7XG52YXIgVGFibGVzID0gcmVxdWlyZSgnLi4vdGFibGVzJyk7XG52YXIgU2FzRGF0YSA9IHJlcXVpcmUoJy4uL3Nhc0RhdGEuanMnKTtcbnZhciBGaWxlcyA9IHJlcXVpcmUoJy4uL2ZpbGVzJyk7XG5cbi8qXG4qIENhbGwgU2FzIHByb2dyYW1cbipcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBQYXRoIG9mIHRoZSBzYXMgcHJvZ3JhbVxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmNhbGwgPSBmdW5jdGlvbihzYXNQcm9ncmFtLCBkYXRhT2JqLCBjYWxsYmFjaywgcGFyYW1zKSB7XG4gIHZhciBzZWxmICAgICAgICA9IHRoaXM7XG4gIHZhciByZXRyeUNvdW50ICA9IDA7XG4gIHZhciBkYmcgICAgICAgICA9IHRoaXMuZGVidWc7XG5cbiAgaWYgKCFjYWxsYmFjayB8fCB0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpe1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBjYWxsYmFjaycpO1xuICB9XG4gIGlmKCFzYXNQcm9ncmFtKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdZb3UgbXVzdCBwcm92aWRlIFNhcyBwcm9ncmFtIGZpbGUgcGF0aCcpO1xuICB9XG4gIGlmKHR5cGVvZiBzYXNQcm9ncmFtICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgcGFyYW1ldGVyIHNob3VsZCBiZSBzdHJpbmcnKTtcbiAgfVxuICBpZih0aGlzLnVzZU11bHRpcGFydEZvcm1EYXRhID09PSBmYWxzZSAmJiAhKGRhdGFPYmogaW5zdGFuY2VvZiBUYWJsZXMpKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdDYW5ub3Qgc2VuZCBmaWxlcyB1c2luZyBhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQuIFBsZWFzZSB1c2UgVGFibGVzIG9yIGRlZmF1bHQgdmFsdWUgZm9yIHVzZU11bHRpcGFydEZvcm1EYXRhJyk7XG4gIH1cblxuICBpZighcGFyYW1zKSB7XG4gICAgcGFyYW1zID0ge1xuICAgICAgX3Byb2dyYW06IHRoaXMuX3V0aWxzLmdldEZ1bGxQcm9ncmFtUGF0aCh0aGlzLm1ldGFkYXRhUm9vdCwgc2FzUHJvZ3JhbSksXG4gICAgICBfZGVidWc6ICAgdGhpcy5kZWJ1ZyA/IDEzMSA6IDAsXG4gICAgICBfc2VydmljZTogJ2RlZmF1bHQnLFxuICAgIH07XG4gIH1cblxuICBpZihkYXRhT2JqKSB7XG4gICAgdmFyIGtleSwgZGF0YVByb3ZpZGVyO1xuICAgIGlmKGRhdGFPYmogaW5zdGFuY2VvZiBUYWJsZXMpIHtcbiAgICAgIGRhdGFQcm92aWRlciA9IGRhdGFPYmouX3RhYmxlcztcbiAgICB9IGVsc2UgaWYoZGF0YU9iaiBpbnN0YW5jZW9mIEZpbGVzIHx8IGRhdGFPYmogaW5zdGFuY2VvZiBTYXNEYXRhKXtcbiAgICAgIGRhdGFQcm92aWRlciA9IGRhdGFPYmouX2ZpbGVzO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1dyb25nIHR5cGUgb2YgdGFibGVzIG9iamVjdCcpO1xuICAgIH1cbiAgICBmb3Ioa2V5IGluIGRhdGFQcm92aWRlcikge1xuICAgICAgaWYoZGF0YVByb3ZpZGVyLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgcGFyYW1zW2tleV0gPSBkYXRhUHJvdmlkZXJba2V5XTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZih0aGlzLl9kaXNhYmxlQ2FsbHMpIHtcbiAgICB0aGlzLl9wZW5kaW5nQ2FsbHMucHVzaCh7XG4gICAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgICAgY2FsbGJhY2s6ICAgY2FsbGJhY2ssXG4gICAgICBwYXJhbXM6ICAgICBwYXJhbXNcbiAgICB9KTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzLl9hamF4LnBvc3QodGhpcy51cmwsIHBhcmFtcywgdGhpcy51c2VNdWx0aXBhcnRGb3JtRGF0YSkuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICBpZihzZWxmLl91dGlscy5uZWVkVG9Mb2dpbi5jYWxsKHNlbGYsIHJlcykpIHtcbiAgICAgIC8vcmVtZW1iZXIgdGhlIGNhbGwgZm9yIGxhdHRlciB1c2VcbiAgICAgIHNlbGYuX3BlbmRpbmdDYWxscy5wdXNoKHtcbiAgICAgICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbSxcbiAgICAgICAgY2FsbGJhY2s6ICAgY2FsbGJhY2ssXG4gICAgICAgIHBhcmFtczogICAgIHBhcmFtc1xuICAgICAgfSk7XG5cbiAgICAgIC8vdGhlcmUncyBubyBuZWVkIHRvIGNvbnRpbnVlIGlmIHByZXZpb3VzIGNhbGwgcmV0dXJuZWQgbG9naW4gZXJyb3JcbiAgICAgIGlmKHNlbGYuX2Rpc2FibGVDYWxscykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdub3RMb2dnZWRpbkVycm9yJywgJ1lvdSBhcmUgbm90IGxvZ2dlZCBpbicpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlc09iaiwgdW5lc2NhcGVkUmVzT2JqLCBlcnI7XG4gICAgICB2YXIgZG9uZSA9IGZhbHNlO1xuXG4gICAgICBpZighZGJnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVzT2JqID0gc2VsZi5fdXRpbHMucGFyc2VSZXMocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKTtcbiAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKHJlc09iai5sb2dtZXNzYWdlLCBzYXNQcm9ncmFtKTtcblxuICAgICAgICAgIGlmKGRhdGFPYmogaW5zdGFuY2VvZiBUYWJsZXMpIHtcbiAgICAgICAgICAgIHVuZXNjYXBlZFJlc09iaiA9IHNlbGYuX3V0aWxzLnVuZXNjYXBlVmFsdWVzKHJlc09iaik7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVuZXNjYXBlZFJlc09iaiA9IHJlc09iajtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZihyZXNPYmouc3RhdHVzICE9PSAnc3VjY2VzcycpIHtcbiAgICAgICAgICAgIGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1FcnJvcicsIHJlc09iai5lcnJvcm1lc3NhZ2UsIHJlc09iai5zdGF0dXMpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGRvbmUgPSB0cnVlO1xuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICBpZihlIGluc3RhbmNlb2YgU3ludGF4RXJyb3IpIHtcbiAgICAgICAgICAgIGlmKHJldHJ5Q291bnQgPCBzZWxmLm1heFhoclJldHJpZXMpIHtcbiAgICAgICAgICAgICAgZG9uZSA9IGZhbHNlO1xuICAgICAgICAgICAgICBzZWxmLl9hamF4LnBvc3Qoc2VsZi51cmwsIHBhcmFtcywgc2VsZi51c2VNdWx0aXBhcnRGb3JtRGF0YSkuc3VjY2Vzcyh0aGlzLnN1Y2Nlc3MpLmVycm9yKHRoaXMuZXJyb3IpO1xuICAgICAgICAgICAgICByZXRyeUNvdW50Kys7XG4gICAgICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coXCJSZXRyeWluZyAjXCIgKyByZXRyeUNvdW50LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgICAgc2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICAgIGVyciA9IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcbiAgICAgICAgICAgICAgZG9uZSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgZXJyID0gZTtcbiAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICBzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Vua25vd25FcnJvcicsIGUubWVzc2FnZSk7XG4gICAgICAgICAgICBlcnIuc3RhY2sgPSBlLnN0YWNrO1xuICAgICAgICAgICAgZG9uZSA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgIGlmKGRvbmUpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgdW5lc2NhcGVkUmVzT2JqKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVzT2JqID0gc2VsZi5fdXRpbHMucGFyc2VEZWJ1Z1JlcyhyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpO1xuICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2cocmVzT2JqLmxvZ21lc3NhZ2UsIHNhc1Byb2dyYW0pO1xuXG4gICAgICAgICAgaWYoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykge1xuICAgICAgICAgICAgdW5lc2NhcGVkUmVzT2JqID0gc2VsZi5fdXRpbHMudW5lc2NhcGVWYWx1ZXMocmVzT2JqKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdW5lc2NhcGVkUmVzT2JqID0gcmVzT2JqO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmKHJlc09iai5zdGF0dXMgIT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgZXJyID0gbmV3IGg1NHNFcnJvcigncHJvZ3JhbUVycm9yJywgcmVzT2JqLmVycm9ybWVzc2FnZSwgcmVzT2JqLnN0YXR1cyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZG9uZSA9IHRydWU7XG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgIGlmKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xuICAgICAgICAgICAgZXJyID0gbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsIGUubWVzc2FnZSk7XG4gICAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgICB9IGVsc2UgaWYoZSBpbnN0YW5jZW9mIGg1NHNFcnJvcikge1xuICAgICAgICAgICAgaWYoZS50eXBlID09PSAncGFyc2VFcnJvcicgJiYgcmV0cnlDb3VudCA8IDEpIHtcbiAgICAgICAgICAgICAgZG9uZSA9IGZhbHNlO1xuICAgICAgICAgICAgICBzZWxmLl9hamF4LnBvc3Qoc2VsZi51cmwsIHBhcmFtcywgc2VsZi51c2VNdWx0aXBhcnRGb3JtRGF0YSkuc3VjY2Vzcyh0aGlzLnN1Y2Nlc3MpLmVycm9yKHRoaXMuZXJyb3IpO1xuICAgICAgICAgICAgICByZXRyeUNvdW50Kys7XG4gICAgICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coXCJSZXRyeWluZyAjXCIgKyByZXRyeUNvdW50LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcbiAgICAgICAgICAgICAgICBlcnIgPSBlO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVyciA9IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXJyID0gbmV3IGg1NHNFcnJvcigndW5rbm93bkVycm9yJywgZS5tZXNzYWdlKTtcbiAgICAgICAgICAgIGVyci5zdGFjayA9IGUuc3RhY2s7XG4gICAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgaWYoZG9uZSkge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyLCB1bmVzY2FwZWRSZXNPYmopO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSkuZXJyb3IoZnVuY3Rpb24ocmVzKSB7XG4gICAgaWYocmVzLnN0YXR1cyA9PT0gNDAxKSB7XG4gICAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdub3RMb2dnZWRpbkVycm9yJywgJ1lvdSBhcmUgbm90IGxvZ2dlZCBpbicpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnUmVxdWVzdCBmYWlsZWQgd2l0aCBzdGF0dXM6ICcgKyByZXMuc3RhdHVzLCBzYXNQcm9ncmFtKTtcbiAgICAgIGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ2h0dHBFcnJvcicsIHJlcy5zdGF0dXNUZXh0KSk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8qXG4qIExvZ2luIG1ldGhvZFxuKlxuKiBAcGFyYW0ge3N0cmluZ30gdXNlciAtIExvZ2luIHVzZXJuYW1lXG4qIEBwYXJhbSB7c3RyaW5nfSBwYXNzIC0gTG9naW4gcGFzc3dvcmRcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiogT1JcbipcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5sb2dpbiA9IGZ1bmN0aW9uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG4gIGlmKCF1c2VyIHx8ICFwYXNzKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdDcmVkZW50aWFscyBub3Qgc2V0Jyk7XG4gIH1cbiAgaWYodHlwZW9mIHVzZXIgIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBwYXNzICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVXNlciBhbmQgcGFzcyBwYXJhbWV0ZXJzIG11c3QgYmUgc3RyaW5ncycpO1xuICB9XG4gIC8vTk9URTogY2FsbGJhY2sgb3B0aW9uYWw/XG4gIGlmKCFjYWxsYmFjayB8fCB0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgY2FsbGJhY2snKTtcbiAgfVxuXG4gIGlmKCF0aGlzLlJFU1RhdXRoKSB7XG4gICAgaGFuZGxlU2FzTG9nb24uY2FsbCh0aGlzLCB1c2VyLCBwYXNzLCBjYWxsYmFjayk7XG4gIH0gZWxzZSB7XG4gICAgaGFuZGxlUmVzdExvZ29uLmNhbGwodGhpcywgdXNlciwgcGFzcywgY2FsbGJhY2spO1xuICB9XG59O1xuXG5mdW5jdGlvbiBoYW5kbGVTYXNMb2dvbih1c2VyLCBwYXNzLCBjYWxsYmFjaykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgdmFyIGxvZ2luUGFyYW1zID0ge1xuICAgIF9zZXJ2aWNlOiAnZGVmYXVsdCcsXG4gICAgdXg6IHVzZXIsXG4gICAgcHg6IHBhc3MsXG4gICAgLy9mb3IgU0FTIDkuNCxcbiAgICB1c2VybmFtZTogdXNlcixcbiAgICBwYXNzd29yZDogcGFzc1xuICB9O1xuXG4gIGZvciAodmFyIGtleSBpbiB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtcykge1xuICAgIGxvZ2luUGFyYW1zW2tleV0gPSB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtc1trZXldO1xuICB9XG5cbiAgdGhpcy5fbG9naW5BdHRlbXB0cyA9IDA7XG5cbiAgdGhpcy5fYWpheC5wb3N0KHRoaXMubG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xuICAgIGlmKCsrc2VsZi5fbG9naW5BdHRlbXB0cyA9PT0gMykge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKC0yKTtcbiAgICB9XG5cbiAgICBpZihzZWxmLl91dGlscy5uZWVkVG9Mb2dpbi5jYWxsKHNlbGYsIHJlcykpIHtcbiAgICAgIC8vd2UgYXJlIGdldHRpbmcgZm9ybSBhZ2FpbiBhZnRlciByZWRpcmVjdFxuICAgICAgLy9hbmQgbmVlZCB0byBsb2dpbiBhZ2FpbiB1c2luZyB0aGUgbmV3IHVybFxuICAgICAgLy9fbG9naW5DaGFuZ2VkIGlzIHNldCBpbiBuZWVkVG9Mb2dpbiBmdW5jdGlvblxuICAgICAgLy9idXQgaWYgbG9naW4gdXJsIGlzIG5vdCBkaWZmZXJlbnQsIHdlIGFyZSBjaGVja2luZyBpZiB0aGVyZSBhcmUgYWRpdGlvbmFsIHBhcmFtZXRlcnNcbiAgICAgIGlmKHNlbGYuX2xvZ2luQ2hhbmdlZCB8fCAoc2VsZi5faXNOZXdMb2dpblBhZ2UgJiYgIXNlbGYuX2FkaXRpb25hbExvZ2luUGFyYW1zKSkge1xuICAgICAgICBkZWxldGUgc2VsZi5fbG9naW5DaGFuZ2VkO1xuXG4gICAgICAgIHZhciBpbnB1dHMgPSByZXMucmVzcG9uc2VUZXh0Lm1hdGNoKC88aW5wdXQuKlwiaGlkZGVuXCJbXj5dKj4vZyk7XG4gICAgICAgIGlmKGlucHV0cykge1xuICAgICAgICAgIGlucHV0cy5mb3JFYWNoKGZ1bmN0aW9uKGlucHV0U3RyKSB7XG4gICAgICAgICAgICB2YXIgdmFsdWVNYXRjaCA9IGlucHV0U3RyLm1hdGNoKC9uYW1lPVwiKFteXCJdKilcIlxcc3ZhbHVlPVwiKFteXCJdKikvKTtcbiAgICAgICAgICAgIGxvZ2luUGFyYW1zW3ZhbHVlTWF0Y2hbMV1dID0gdmFsdWVNYXRjaFsyXTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzdWNjZXNzID0gdGhpcy5zdWNjZXNzLCBlcnJvciA9IHRoaXMuZXJyb3I7XG4gICAgICAgIHNlbGYuX2FqYXgucG9zdChzZWxmLmxvZ2luVXJsLCBsb2dpblBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbigpIHtcbiAgICAgICAgICAvL3dlIG5lZWQgdGhpcyBnZXQgcmVxdWVzdCBiZWNhdXNlIG9mIHRoZSBzYXMgOS40IHNlY3VyaXR5IGNoZWNrc1xuICAgICAgICAgIHNlbGYuX2FqYXguZ2V0KHNlbGYudXJsKS5zdWNjZXNzKHN1Y2Nlc3MpLmVycm9yKGVycm9yKTtcbiAgICAgICAgfSkuZXJyb3IodGhpcy5lcnJvcik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvL2dldHRpbmcgZm9ybSBhZ2FpbiwgYnV0IGl0IHdhc24ndCBhIHJlZGlyZWN0XG4gICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ1dyb25nIHVzZXJuYW1lIG9yIHBhc3N3b3JkJyk7XG4gICAgICAgIGNhbGxiYWNrKC0xKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG5cbiAgICAgIHNlbGYuX2Rpc2FibGVDYWxscyA9IGZhbHNlO1xuXG4gICAgICB3aGlsZShzZWxmLl9wZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xuICAgICAgICB2YXIgcGVuZGluZ0NhbGwgICAgID0gc2VsZi5fcGVuZGluZ0NhbGxzLnNoaWZ0KCk7XG4gICAgICAgIHZhciBtZXRob2QgICAgICAgICAgPSBwZW5kaW5nQ2FsbC5tZXRob2QgfHwgc2VsZi5jYWxsLmJpbmQoc2VsZik7XG4gICAgICAgIHZhciBzYXNQcm9ncmFtICAgICAgPSBwZW5kaW5nQ2FsbC5zYXNQcm9ncmFtO1xuICAgICAgICB2YXIgY2FsbGJhY2tQZW5kaW5nID0gcGVuZGluZ0NhbGwuY2FsbGJhY2s7XG4gICAgICAgIHZhciBwYXJhbXMgICAgICAgICAgPSBwZW5kaW5nQ2FsbC5wYXJhbXM7XG5cbiAgICAgICAgLy91cGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxuICAgICAgICBwYXJhbXMuX2RlYnVnID0gc2VsZi5kZWJ1ZyA/IDEzMSA6IDA7XG5cbiAgICAgICAgaWYoc2VsZi5yZXRyeUFmdGVyTG9naW4pIHtcbiAgICAgICAgICBtZXRob2Qoc2FzUHJvZ3JhbSwgbnVsbCwgY2FsbGJhY2tQZW5kaW5nLCBwYXJhbXMpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9KS5lcnJvcihmdW5jdGlvbihyZXMpIHtcbiAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuICAgIGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlUmVzdExvZ29uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICB2YXIgbG9naW5QYXJhbXMgPSB7XG4gICAgdXNlcm5hbWU6IHVzZXIsXG4gICAgcGFzc3dvcmQ6IHBhc3NcbiAgfTtcblxuICB0aGlzLl9hamF4LnBvc3QodGhpcy5SRVNUYXV0aExvZ2luVXJsLCBsb2dpblBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICB2YXIgbG9jYXRpb24gPSByZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ0xvY2F0aW9uJyk7XG5cbiAgICBzZWxmLl9hamF4LnBvc3QobG9jYXRpb24sIHtcbiAgICAgIHNlcnZpY2U6IHNlbGYudXJsXG4gICAgfSkuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICAgIGlmKHNlbGYudXJsLmluZGV4T2YoJz8nKSA9PT0gLTEpIHtcbiAgICAgICAgc2VsZi51cmwgKz0gJz90aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZihzZWxmLnVybC5pbmRleE9mKCd0aWNrZXQnKSAhPT0gLTEpIHtcbiAgICAgICAgICBzZWxmLnVybCA9IHNlbGYudXJsLnJlcGxhY2UoL3RpY2tldD1bXiZdKy8sICd0aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNlbGYudXJsICs9ICcmdGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0O1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuICAgIH0pLmVycm9yKGZ1bmN0aW9uKHJlcykge1xuICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcbiAgICAgIGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuICAgIH0pO1xuICB9KS5lcnJvcihmdW5jdGlvbihyZXMpIHtcbiAgICBpZihyZXMucmVzcG9uc2VUZXh0ID09PSAnZXJyb3IuYXV0aGVudGljYXRpb24uY3JlZGVudGlhbHMuYmFkJykge1xuICAgICAgY2FsbGJhY2soLTEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuICAgICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG4gICAgfVxuICB9KTtcbn1cblxuLypcbiogTG9nb3V0IG1ldGhvZFxuKlxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKi9cblxubW9kdWxlLmV4cG9ydHMubG9nb3V0ID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgdGhpcy5fYWpheC5nZXQodGhpcy51cmwsIHtfYWN0aW9uOiAnbG9nb2ZmJ30pLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgY2FsbGJhY2soKTtcbiAgfSkuZXJyb3IoZnVuY3Rpb24ocmVzKSB7XG4gICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9nb3V0IGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG4gICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG4gIH0pO1xufTtcblxuLypcbiogRW50ZXIgZGVidWcgbW9kZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnNldERlYnVnTW9kZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmRlYnVnID0gdHJ1ZTtcbn07XG5cbi8qXG4qIEV4aXQgZGVidWcgbW9kZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnVuc2V0RGVidWdNb2RlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZGVidWcgPSBmYWxzZTtcbn07XG5cbmZvcih2YXIga2V5IGluIGxvZ3MuZ2V0KSB7XG4gIGlmKGxvZ3MuZ2V0Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICBtb2R1bGUuZXhwb3J0c1trZXldID0gbG9ncy5nZXRba2V5XTtcbiAgfVxufVxuXG5mb3IodmFyIGtleSBpbiBsb2dzLmNsZWFyKSB7XG4gIGlmKGxvZ3MuY2xlYXIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgIG1vZHVsZS5leHBvcnRzW2tleV0gPSBsb2dzLmNsZWFyW2tleV07XG4gIH1cbn1cblxuLypcbiogQWRkIGNhbGxiYWNrIGZ1bmN0aW9ucyBleGVjdXRlZCB3aGVuIHByb3BlcnRpZXMgYXJlIHVwZGF0ZWQgd2l0aCByZW1vdGUgY29uZmlnXG4qXG4qQGNhbGxiYWNrIC0gY2FsbGJhY2sgcHVzaGVkIHRvIGFycmF5XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMub25SZW1vdGVDb25maWdVcGRhdGUgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICB0aGlzLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLl91dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcbiIsInZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xudmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5cbnZhciBwcm9ncmFtTm90Rm91bmRQYXR0ID0gLzx0aXRsZT4oU3RvcmVkIFByb2Nlc3MgRXJyb3J8U0FTU3RvcmVkUHJvY2Vzcyk8XFwvdGl0bGU+W1xcc1xcU10qPGgyPihTdG9yZWQgcHJvY2VzcyBub3QgZm91bmQ6Lip8Lipub3QgYSB2YWxpZCBzdG9yZWQgcHJvY2VzcyBwYXRoLik8XFwvaDI+LztcbnZhciByZXNwb25zZVJlcGxhY2UgPSBmdW5jdGlvbihyZXMpIHtcbiAgcmV0dXJuIHJlcy5yZXBsYWNlKC8oXFxyXFxufFxccnxcXG4pL2csICcnKS5yZXBsYWNlKC9cXFxcXFxcXChufHJ8dHxmfGIpL2csICdcXFxcJDEnKS5yZXBsYWNlKC9cXFxcXCJcXFxcXCIvZywgJ1xcXFxcIicpO1xufTtcblxuLypcbiogUGFyc2UgcmVzcG9uc2UgZnJvbSBzZXJ2ZXJcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlUmVzID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgdmFyIG1hdGNoZXMgPSByZXNwb25zZVRleHQubWF0Y2gocHJvZ3JhbU5vdEZvdW5kUGF0dCk7XG4gIGlmKG1hdGNoZXMpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtTm90Rm91bmQnLCAnWW91IGhhdmUgbm90IGJlZW4gZ3JhbnRlZCBwZXJtaXNzaW9uIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24sIG9yIHRoZSBTVFAgaXMgbWlzc2luZy4nKTtcbiAgfVxuICAvL3JlbW92ZSBuZXcgbGluZXMgaW4ganNvbiByZXNwb25zZVxuICAvL3JlcGxhY2UgXFxcXChkKSB3aXRoIFxcKGQpIC0gU0FTIGpzb24gcGFyc2VyIGlzIGVzY2FwaW5nIGl0XG4gIHJldHVybiBKU09OLnBhcnNlKHJlc3BvbnNlUmVwbGFjZShyZXNwb25zZVRleHQpKTtcbn07XG5cbi8qXG4qIFBhcnNlIHJlc3BvbnNlIGZyb20gc2VydmVyIGluIGRlYnVnIG1vZGVcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlRGVidWdSZXMgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcykge1xuICB2YXIgbWF0Y2hlcyA9IHJlc3BvbnNlVGV4dC5tYXRjaChwcm9ncmFtTm90Rm91bmRQYXR0KTtcbiAgaWYobWF0Y2hlcykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1Ob3RGb3VuZCcsICdZb3UgaGF2ZSBub3QgYmVlbiBncmFudGVkIHBlcm1pc3Npb24gdG8gcGVyZm9ybSB0aGlzIGFjdGlvbiwgb3IgdGhlIFNUUCBpcyBtaXNzaW5nLicpO1xuICB9XG5cbiAgLy9maW5kIGpzb25cbiAgcGF0dCAgICAgICAgICAgICAgPSAvXiguPy0taDU0cy1kYXRhLXN0YXJ0LS0pKFtcXFNcXHNdKj8pKC0taDU0cy1kYXRhLWVuZC0tKS9tO1xuICBtYXRjaGVzICAgICAgICAgICA9IHJlc3BvbnNlVGV4dC5tYXRjaChwYXR0KTtcblxuICB2YXIgcGFnZSAgICAgICAgICA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKHBhdHQsICcnKTtcbiAgdmFyIGh0bWxCb2R5UGF0dCAgPSAvPGJvZHkuKj4oW1xcc1xcU10qKTxcXC9ib2R5Pi87XG4gIHZhciBib2R5TWF0Y2hlcyAgID0gcGFnZS5tYXRjaChodG1sQm9keVBhdHQpO1xuXG4gIC8vcmVtb3ZlIGh0bWwgdGFnc1xuICB2YXIgZGVidWdUZXh0ID0gYm9keU1hdGNoZXNbMV0ucmVwbGFjZSgvPFtePl0qPi9nLCAnJyk7XG4gIGRlYnVnVGV4dCAgICAgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhkZWJ1Z1RleHQpO1xuXG4gIGxvZ3MuYWRkRGVidWdEYXRhKGJvZHlNYXRjaGVzWzFdLCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0sIHBhcmFtcyk7XG5cbiAgaWYodGhpcy5wYXJzZUVycm9yUmVzcG9uc2UocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKSkge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3Nhc0Vycm9yJywgJ1NhcyBwcm9ncmFtIGNvbXBsZXRlZCB3aXRoIGVycm9ycycpO1xuICB9XG5cbiAgaWYoIW1hdGNoZXMpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJyk7XG4gIH1cbiAgLy9yZW1vdmUgbmV3IGxpbmVzIGluIGpzb24gcmVzcG9uc2VcbiAgLy9yZXBsYWNlIFxcXFwoZCkgd2l0aCBcXChkKSAtIFNBUyBqc29uIHBhcnNlciBpcyBlc2NhcGluZyBpdFxuICB2YXIganNvbk9iaiA9IEpTT04ucGFyc2UocmVzcG9uc2VSZXBsYWNlKG1hdGNoZXNbMl0pKTtcblxuICByZXR1cm4ganNvbk9iajtcbn07XG5cbi8qXG4qIEFkZCBmYWlsZWQgcmVzcG9uc2UgdG8gbG9ncyAtIHVzZWQgb25seSBpZiBkZWJ1Zz1mYWxzZVxuKlxuKiBAcGFyYW0ge29iamVjdH0gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSBwYXRoXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkRmFpbGVkUmVzcG9uc2UgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pIHtcbiAgdmFyIHBhdHQgICAgICA9IC88c2NyaXB0KFtcXHNcXFNdKilcXC9mb3JtPi87XG4gIHZhciBwYXR0MiAgICAgPSAvZGlzcGxheVxccz86XFxzP25vbmU7P1xccz8vO1xuICAvL3JlbW92ZSBzY3JpcHQgd2l0aCBmb3JtIGZvciB0b2dnbGluZyB0aGUgbG9ncyBhbmQgXCJkaXNwbGF5Om5vbmVcIiBmcm9tIHN0eWxlXG4gIHJlc3BvbnNlVGV4dCAgPSByZXNwb25zZVRleHQucmVwbGFjZShwYXR0LCAnJykucmVwbGFjZShwYXR0MiwgJycpO1xuICB2YXIgZGVidWdUZXh0ID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UoLzxbXj5dKj4vZywgJycpO1xuICBkZWJ1Z1RleHQgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhkZWJ1Z1RleHQpO1xuXG4gIGxvZ3MuYWRkRmFpbGVkUmVxdWVzdChyZXNwb25zZVRleHQsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSk7XG59O1xuXG4vKlxuKiBVbmVzY2FwZSBhbGwgc3RyaW5nIHZhbHVlcyBpbiByZXR1cm5lZCBvYmplY3RcbipcbiogQHBhcmFtIHtvYmplY3R9IG9ialxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnVuZXNjYXBlVmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnc3RyaW5nJykge1xuICAgICAgb2JqW2tleV0gPSBkZWNvZGVVUklDb21wb25lbnQob2JqW2tleV0pO1xuICAgIH0gZWxzZSBpZih0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgICAgdGhpcy51bmVzY2FwZVZhbHVlcyhvYmpba2V5XSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvYmo7XG59O1xuXG4vKlxuKiBQYXJzZSBlcnJvciByZXNwb25zZSBmcm9tIHNlcnZlciBhbmQgc2F2ZSBlcnJvcnMgaW4gbWVtb3J5XG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbiogI3BhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSB3aGljaCByZXR1cm5lZCB0aGUgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZUVycm9yUmVzcG9uc2UgPSBmdW5jdGlvbihyZXMsIHNhc1Byb2dyYW0pIHtcbiAgLy9jYXB0dXJlICdFUlJPUjogW3RleHRdLicgb3IgJ0VSUk9SIHh4IFt0ZXh0XS4nXG4gIHZhciBwYXR0ICAgID0gL15FUlJPUig6XFxzfFxcc1xcZFxcZCkoLipcXC58LipcXG4uKlxcLikvZ207XG4gIHZhciBlcnJvcnMgID0gcmVzLnJlcGxhY2UoLyg8KFtePl0rKT4pL2lnLCAnJykubWF0Y2gocGF0dCk7XG4gIGlmKCFlcnJvcnMpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgZXJyTWVzc2FnZTtcbiAgZm9yKHZhciBpID0gMCwgbiA9IGVycm9ycy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICBlcnJNZXNzYWdlICA9IGVycm9yc1tpXS5yZXBsYWNlKC88W14+XSo+L2csICcnKS5yZXBsYWNlKC8oXFxufFxcc3syLH0pL2csICcgJyk7XG4gICAgZXJyTWVzc2FnZSAgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhlcnJNZXNzYWdlKTtcbiAgICBlcnJvcnNbaV0gICA9IHtcbiAgICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgICBtZXNzYWdlOiAgICBlcnJNZXNzYWdlLFxuICAgICAgdGltZTogICAgICAgbmV3IERhdGUoKVxuICAgIH07XG4gIH1cblxuICBsb2dzLmFkZFNhc0Vycm9ycyhlcnJvcnMpO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuLypcbiogRGVjb2RlIEhUTUwgZW50aXRpZXNcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmRlY29kZUhUTUxFbnRpdGllcyA9IGZ1bmN0aW9uIChodG1sKSB7XG4gIHZhciB0ZW1wRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgdmFyIHN0ciAgICAgICAgID0gaHRtbC5yZXBsYWNlKC8mKCMoPzp4WzAtOWEtZl0rfFxcZCspfFthLXpdKyk7L2dpLFxuICAgIGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgIHRlbXBFbGVtZW50LmlubmVySFRNTCA9IHN0cjtcbiAgICAgIHN0ciAgICAgICAgICAgICAgICAgICA9IHRlbXBFbGVtZW50LnRleHRDb250ZW50IHx8IHRlbXBFbGVtZW50LmlubmVyVGV4dDtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICApO1xuICByZXR1cm4gc3RyO1xufTtcblxuLypcbiogQ29udmVydCBzYXMgdGltZSB0byBqYXZhc2NyaXB0IGRhdGVcbipcbiogQHBhcmFtIHtudW1iZXJ9IHNhc0RhdGUgLSBzYXMgVGF0ZSBvYmplY3RcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5mcm9tU2FzRGF0ZVRpbWUgPSBmdW5jdGlvbiAoc2FzRGF0ZSkge1xuICB2YXIgYmFzZWRhdGUgPSBuZXcgRGF0ZShcIkphbnVhcnkgMSwgMTk2MCAwMDowMDowMFwiKTtcbiAgdmFyIGN1cnJkYXRlID0gc2FzRGF0ZTtcblxuICAvLyBvZmZzZXRzIGZvciBVVEMgYW5kIHRpbWV6b25lcyBhbmQgQlNUXG4gIHZhciBiYXNlT2Zmc2V0ID0gYmFzZWRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xuXG4gIC8vIGNvbnZlcnQgc2FzIGRhdGV0aW1lIHRvIGEgY3VycmVudCB2YWxpZCBqYXZhc2NyaXB0IGRhdGVcbiAgdmFyIGJhc2VkYXRlTXMgID0gYmFzZWRhdGUuZ2V0VGltZSgpOyAvLyBpbiBtc1xuICB2YXIgY3VycmRhdGVNcyAgPSBjdXJyZGF0ZSAqIDEwMDA7IC8vIHRvIG1zXG4gIHZhciBzYXNEYXRldGltZSA9IGN1cnJkYXRlTXMgKyBiYXNlZGF0ZU1zO1xuICB2YXIganNEYXRlICAgICAgPSBuZXcgRGF0ZSgpO1xuICBqc0RhdGUuc2V0VGltZShzYXNEYXRldGltZSk7IC8vIGZpcnN0IHRpbWUgdG8gZ2V0IG9mZnNldCBCU1QgZGF5bGlnaHQgc2F2aW5ncyBldGNcbiAgdmFyIGN1cnJPZmZzZXQgID0ganNEYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGFkanVzdCBmb3Igb2Zmc2V0IGluIG1pbnV0ZXNcbiAgdmFyIG9mZnNldFZhciAgID0gKGJhc2VPZmZzZXQgLSBjdXJyT2Zmc2V0KSAqIDYwICogMTAwMDsgLy8gZGlmZmVyZW5jZSBpbiBtaWxsaXNlY29uZHNcbiAgdmFyIG9mZnNldFRpbWUgID0gc2FzRGF0ZXRpbWUgLSBvZmZzZXRWYXI7IC8vIGZpbmRpbmcgQlNUIGFuZCBkYXlsaWdodCBzYXZpbmdzXG4gIGpzRGF0ZS5zZXRUaW1lKG9mZnNldFRpbWUpOyAvLyB1cGRhdGUgd2l0aCBvZmZzZXRcbiAgcmV0dXJuIGpzRGF0ZTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLm5lZWRUb0xvZ2luID0gZnVuY3Rpb24ocmVzcG9uc2VPYmopIHtcbiAgdmFyIHBhdHQgPSAvPGZvcm0uK2FjdGlvbj1cIiguKkxvZ29uW15cIl0qKS4qPi87XG4gIHZhciBtYXRjaGVzID0gcGF0dC5leGVjKHJlc3BvbnNlT2JqLnJlc3BvbnNlVGV4dCk7XG4gIHZhciBuZXdMb2dpblVybDtcblxuICBpZighbWF0Y2hlcykge1xuICAgIC8vdGhlcmUncyBubyBmb3JtLCB3ZSBhcmUgaW4uIGhvb3JheSFcbiAgICByZXR1cm4gZmFsc2U7XG4gIH0gZWxzZSB7XG4gICAgdmFyIGFjdGlvblVybCA9IG1hdGNoZXNbMV0ucmVwbGFjZSgvXFw/LiovLCAnJyk7XG4gICAgaWYoYWN0aW9uVXJsLmNoYXJBdCgwKSA9PT0gJy8nKSB7XG4gICAgICBuZXdMb2dpblVybCA9IHRoaXMuaG9zdFVybCA/IHRoaXMuaG9zdFVybCArIGFjdGlvblVybCA6IGFjdGlvblVybDtcbiAgICAgIGlmKG5ld0xvZ2luVXJsICE9PSB0aGlzLmxvZ2luVXJsKSB7XG4gICAgICAgIHRoaXMuX2xvZ2luQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIHRoaXMubG9naW5VcmwgPSBuZXdMb2dpblVybDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy9yZWxhdGl2ZSBwYXRoXG5cbiAgICAgIHZhciBsYXN0SW5kT2ZTbGFzaCA9IHJlc3BvbnNlT2JqLnJlc3BvbnNlVVJMLmxhc3RJbmRleE9mKCcvJykgKyAxO1xuICAgICAgLy9yZW1vdmUgZXZlcnl0aGluZyBhZnRlciB0aGUgbGFzdCBzbGFzaCwgYW5kIGV2ZXJ5dGhpbmcgdW50aWwgdGhlIGZpcnN0XG4gICAgICB2YXIgcmVsYXRpdmVMb2dpblVybCA9IHJlc3BvbnNlT2JqLnJlc3BvbnNlVVJMLnN1YnN0cigwLCBsYXN0SW5kT2ZTbGFzaCkucmVwbGFjZSgvLipcXC97Mn1bXlxcL10qLywgJycpICsgYWN0aW9uVXJsO1xuICAgICAgbmV3TG9naW5VcmwgPSB0aGlzLmhvc3RVcmwgPyB0aGlzLmhvc3RVcmwgKyByZWxhdGl2ZUxvZ2luVXJsIDogcmVsYXRpdmVMb2dpblVybDtcbiAgICAgIGlmKG5ld0xvZ2luVXJsICE9PSB0aGlzLmxvZ2luVXJsKSB7XG4gICAgICAgIHRoaXMuX2xvZ2luQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIHRoaXMubG9naW5VcmwgPSBuZXdMb2dpblVybDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL3NhdmUgcGFyYW1ldGVycyBmcm9tIGhpZGRlbiBmb3JtIGZpZWxkc1xuICAgIHZhciBpbnB1dHMgPSByZXNwb25zZU9iai5yZXNwb25zZVRleHQubWF0Y2goLzxpbnB1dC4qXCJoaWRkZW5cIltePl0qPi9nKTtcbiAgICB2YXIgaGlkZGVuRm9ybVBhcmFtcyA9IHt9O1xuICAgIGlmKGlucHV0cykge1xuICAgICAgLy9pdCdzIG5ldyBsb2dpbiBwYWdlIGlmIHdlIGhhdmUgdGhlc2UgYWRkaXRpb25hbCBwYXJhbWV0ZXJzXG4gICAgICB0aGlzLl9pc05ld0xvZ2luUGFnZSA9IHRydWU7XG4gICAgICBpbnB1dHMuZm9yRWFjaChmdW5jdGlvbihpbnB1dFN0cikge1xuICAgICAgICB2YXIgdmFsdWVNYXRjaCA9IGlucHV0U3RyLm1hdGNoKC9uYW1lPVwiKFteXCJdKilcIlxcc3ZhbHVlPVwiKFteXCJdKikvKTtcbiAgICAgICAgaGlkZGVuRm9ybVBhcmFtc1t2YWx1ZU1hdGNoWzFdXSA9IHZhbHVlTWF0Y2hbMl07XG4gICAgICB9KTtcbiAgICAgIHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zID0gaGlkZGVuRm9ybVBhcmFtcztcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufTtcblxuLypcbiogR2V0IGZ1bGwgcHJvZ3JhbSBwYXRoIGZyb20gbWV0YWRhdGEgcm9vdCBhbmQgcmVsYXRpdmUgcGF0aFxuKlxuKiBAcGFyYW0ge3N0cmluZ30gbWV0YWRhdGFSb290IC0gTWV0YWRhdGEgcm9vdCAocGF0aCB3aGVyZSBhbGwgcHJvZ3JhbXMgZm9yIHRoZSBwcm9qZWN0IGFyZSBsb2NhdGVkKVxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbVBhdGggLSBTYXMgcHJvZ3JhbSBwYXRoXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuZ2V0RnVsbFByb2dyYW1QYXRoID0gZnVuY3Rpb24obWV0YWRhdGFSb290LCBzYXNQcm9ncmFtUGF0aCkge1xuICByZXR1cm4gbWV0YWRhdGFSb290ID8gbWV0YWRhdGFSb290LnJlcGxhY2UoL1xcLz8kLywgJy8nKSArIHNhc1Byb2dyYW1QYXRoLnJlcGxhY2UoL15cXC8vLCAnJykgOiBzYXNQcm9ncmFtUGF0aDtcbn07XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi9lcnJvci5qcycpO1xudmFyIGxvZ3MgICAgICA9IHJlcXVpcmUoJy4vbG9ncy5qcycpO1xudmFyIFRhYmxlcyAgICA9IHJlcXVpcmUoJy4vdGFibGVzJyk7XG52YXIgRmlsZXMgICAgID0gcmVxdWlyZSgnLi9maWxlcycpO1xudmFyIHRvU2FzRGF0ZVRpbWUgPSByZXF1aXJlKCcuL3RhYmxlcy91dGlscy5qcycpLnRvU2FzRGF0ZVRpbWU7XG5cbmZ1bmN0aW9uIHZhbGlkYXRlTWFjcm8obWFjcm9OYW1lKSB7XG4gIGlmKG1hY3JvTmFtZS5sZW5ndGggPiAzMikge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgbmFtZSB0b28gbG9uZy4gTWF4aW11bSBpcyAzMiBjaGFyYWN0ZXJzJyk7XG4gIH1cblxuICB2YXIgY2hhckNvZGVBdDAgPSBtYWNyb05hbWUuY2hhckNvZGVBdCgwKTtcbiAgLy8gdmFsaWRhdGUgaXQgc3RhcnRzIHdpdGggQS1aLCBhLXosIG9yIF9cbiAgaWYoKGNoYXJDb2RlQXQwIDwgNjUgfHwgY2hhckNvZGVBdDAgPiA5MCkgJiYgKGNoYXJDb2RlQXQwIDwgOTcgfHwgY2hhckNvZGVBdDAgPiAxMjIpICYmIG1hY3JvTmFtZVswXSAhPT0gJ18nKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUYWJsZSBuYW1lIHN0YXJ0aW5nIHdpdGggbnVtYmVyIG9yIHNwZWNpYWwgY2hhcmFjdGVycycpO1xuICB9XG5cbiAgZm9yKHZhciBpID0gMDsgaSA8IG1hY3JvTmFtZS5sZW5ndGg7IGkrKykge1xuICAgIHZhciBjaGFyQ29kZSA9IG1hY3JvTmFtZS5jaGFyQ29kZUF0KGkpO1xuXG4gICAgaWYoKGNoYXJDb2RlIDwgNDggfHwgY2hhckNvZGUgPiA1NykgJiZcbiAgICAgIChjaGFyQ29kZSA8IDY1IHx8IGNoYXJDb2RlID4gOTApICYmXG4gICAgICAoY2hhckNvZGUgPCA5NyB8fCBjaGFyQ29kZSA+IDEyMikgJiZcbiAgICAgIG1hY3JvTmFtZVtpXSAhPT0gJ18nKVxuICAgIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgbmFtZSBoYXMgdW5zdXBwb3J0ZWQgY2hhcmFjdGVycycpO1xuICAgIH1cbiAgfVxufVxuXG4vKlxuKiBoNTRzIFNBUyBkYXRhIG9iamVjdCBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge2FycmF5fGZpbGV9IGRhdGEgLSBUYWJsZSBvciBmaWxlIGFkZGVkIHdoZW4gb2JqZWN0IGlzIGNyZWF0ZWRcbipAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gbWFjcm8gbmFtZVxuKkBwYXJhbSB7bnVtYmVyfSBwYXJhbWV0ZXJUaHJlc2hvbGQgLSBzaXplIG9mIGRhdGEgb2JqZWN0cyBzZW50IHRvIFNBU1xuKlxuKi9cbmZ1bmN0aW9uIFNhc0RhdGEoZGF0YSwgbWFjcm9OYW1lLCBzcGVjcykge1xuICBpZihkYXRhIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICB0aGlzLl9maWxlcyA9IHt9O1xuICAgIHRoaXMuYWRkVGFibGUoZGF0YSwgbWFjcm9OYW1lLCBzcGVjcyk7XG4gIH0gZWxzZSBpZihkYXRhIGluc3RhbmNlb2YgRmlsZSB8fCBkYXRhIGluc3RhbmNlb2YgQmxvYikge1xuICAgIEZpbGVzLmNhbGwodGhpcywgZGF0YSwgbWFjcm9OYW1lKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0RhdGEgYXJndW1lbnQgd3JvbmcgdHlwZSBvciBtaXNzaW5nJyk7XG4gIH1cbn1cblxuLypcbiogQWRkIHRhYmxlIHRvIHRhYmxlcyBvYmplY3RcbiogQHBhcmFtIHthcnJheX0gdGFibGUgLSBBcnJheSBvZiB0YWJsZSBvYmplY3RzXG4qIEBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBTYXMgbWFjcm8gbmFtZVxuKlxuKi9cblNhc0RhdGEucHJvdG90eXBlLmFkZFRhYmxlID0gZnVuY3Rpb24odGFibGUsIG1hY3JvTmFtZSwgc3BlY3MpIHtcbiAgdmFyIGlzU3BlY3NQcm92aWRlZCA9ICEhc3BlY3M7XG4gIGlmKHRhYmxlICYmIG1hY3JvTmFtZSkge1xuICAgIGlmKCEodGFibGUgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgYXJndW1lbnQgbXVzdCBiZSBhcnJheScpO1xuICAgIH1cbiAgICBpZih0eXBlb2YgbWFjcm9OYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdTZWNvbmQgYXJndW1lbnQgbXVzdCBiZSBzdHJpbmcnKTtcbiAgICB9XG5cbiAgICB2YWxpZGF0ZU1hY3JvKG1hY3JvTmFtZSk7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGFyZ3VtZW50cycpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiB0YWJsZSAhPT0gJ29iamVjdCcgfHwgISh0YWJsZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgYXJndW1lbnQgaXMgbm90IGFuIGFycmF5Jyk7XG4gIH1cblxuICB2YXIga2V5O1xuICBpZihzcGVjcykge1xuICAgIGlmKHNwZWNzLmNvbnN0cnVjdG9yICE9PSBPYmplY3QpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU3BlY3MgZGF0YSB0eXBlIHdyb25nLiBPYmplY3QgZXhwZWN0ZWQuJyk7XG4gICAgfVxuICAgIGZvcihrZXkgaW4gdGFibGVbMF0pIHtcbiAgICAgIGlmKCFzcGVjc1trZXldKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBjb2x1bW5zIGluIHNwZWNzIGRhdGEuJyk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvcihrZXkgaW4gc3BlY3MpIHtcbiAgICAgIGlmKHNwZWNzW2tleV0uY29uc3RydWN0b3IgIT09IE9iamVjdCkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1dyb25nIGNvbHVtbiBkZXNjcmlwdG9yIGluIHNwZWNzIGRhdGEuJyk7XG4gICAgICB9XG4gICAgICBpZighc3BlY3Nba2V5XS5jb2xUeXBlIHx8ICFzcGVjc1trZXldLmNvbExlbmd0aCkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgY29sdW1ucyBpbiBzcGVjcyBkZXNjcmlwdG9yLicpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHZhciBpLCBqLCAvL2NvdW50ZXJzIHVzZWQgbGF0dGVyIGluIGNvZGVcbiAgICAgIHJvdywgdmFsLCB0eXBlLFxuICAgICAgc3BlY0tleXMgPSBbXSxcbiAgICAgIHNwZWNpYWxDaGFycyA9IFsnXCInLCAnXFxcXCcsICcvJywgJ1xcbicsICdcXHQnLCAnXFxmJywgJ1xccicsICdcXGInXTtcblxuICBpZighc3BlY3MpIHtcbiAgICBzcGVjcyA9IHt9O1xuXG4gICAgZm9yIChpID0gMDsgaSA8IHRhYmxlLmxlbmd0aDsgaSsrKSB7XG4gICAgICByb3cgPSB0YWJsZVtpXTtcblxuICAgICAgaWYodHlwZW9mIHJvdyAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUYWJsZSBpdGVtIGlzIG5vdCBhbiBvYmplY3QnKTtcbiAgICAgIH1cblxuICAgICAgZm9yKGtleSBpbiByb3cpIHtcbiAgICAgICAgaWYocm93Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICB2YWwgID0gcm93W2tleV07XG4gICAgICAgICAgdHlwZSA9IHR5cGVvZiB2YWw7XG5cbiAgICAgICAgICBpZihzcGVjc1trZXldID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHNwZWNLZXlzLnB1c2goa2V5KTtcbiAgICAgICAgICAgIHNwZWNzW2tleV0gPSB7fTtcblxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgIGlmKHZhbCA8IE51bWJlci5NSU5fU0FGRV9JTlRFR0VSIHx8IHZhbCA+IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB7XG4gICAgICAgICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnT2JqZWN0WycgKyBpICsgJ10uJyArIGtleSArICcgLSBUaGlzIHZhbHVlIGV4Y2VlZHMgZXhwZWN0ZWQgbnVtZXJpYyBwcmVjaXNpb24uJyk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgPSAnbnVtJztcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSA4O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJyAmJiAhKHZhbCBpbnN0YW5jZW9mIERhdGUpKSB7IC8vIHN0cmFpZ2h0Zm9yd2FyZCBzdHJpbmdcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgID0gJ3N0cmluZyc7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoICA9IHZhbC5sZW5ndGg7XG4gICAgICAgICAgICB9IGVsc2UgaWYodmFsIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbFR5cGUgICA9ICdkYXRlJztcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSA4O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbFR5cGUgICA9ICdqc29uJztcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSBKU09OLnN0cmluZ2lmeSh2YWwpLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgc3BlY0tleXMgPSBPYmplY3Qua2V5cyhzcGVjcyk7XG4gIH1cblxuICB2YXIgc2FzQ3N2ID0gJyc7XG5cbiAgLy8gd2UgbmVlZCB0d28gbG9vcHMgLSB0aGUgZmlyc3Qgb25lIGlzIGNyZWF0aW5nIHNwZWNzIGFuZCB2YWxpZGF0aW5nXG4gIGZvciAoaSA9IDA7IGkgPCB0YWJsZS5sZW5ndGg7IGkrKykge1xuICAgIHJvdyA9IHRhYmxlW2ldO1xuICAgIGZvcihqID0gMDsgaiA8IHNwZWNLZXlzLmxlbmd0aDsgaisrKSB7XG4gICAgICBrZXkgPSBzcGVjS2V5c1tqXTtcbiAgICAgIGlmKHJvdy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgIHZhbCAgPSByb3dba2V5XTtcbiAgICAgICAgdHlwZSA9IHR5cGVvZiB2YWw7XG5cbiAgICAgICAgaWYodHlwZSA9PT0gJ251bWJlcicgJiYgaXNOYU4odmFsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdOYU4gdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYodmFsID09PSAtSW5maW5pdHkgfHwgdmFsID09PSBJbmZpbml0eSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsIHZhbC50b1N0cmluZygpICsgJyB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBpZih2YWwgPT09IHRydWUgfHwgdmFsID09PSBmYWxzZSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdCb29sZWFuIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmKHR5cGUgPT09ICdzdHJpbmcnICYmIHZhbC5pbmRleE9mKCdcXG4nKSAhPT0gLTEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnTmV3IGxpbmUgY2hhcmFjdGVyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNvbnZlcnQgbnVsbCB0byAnLicgZm9yIG51bWJlcnMgYW5kIHRvICcnIGZvciBzdHJpbmdzXG4gICAgICAgIGlmKHZhbCA9PT0gbnVsbCkge1xuICAgICAgICAgIGlmKHNwZWNzW2tleV0uY29sVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHZhbCA9ICcnO1xuICAgICAgICAgICAgdHlwZSA9ICdzdHJpbmcnO1xuICAgICAgICAgIH0gZWxzZSBpZihzcGVjc1trZXldLmNvbFR5cGUgPT09ICdudW0nKSB7XG4gICAgICAgICAgICB2YWwgPSAnLic7XG4gICAgICAgICAgICB0eXBlID0gJ251bWJlcic7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdDYW5ub3QgY29udmVydCBudWxsIHZhbHVlJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICBpZiAoKHR5cGUgPT09ICdudW1iZXInICYmIHNwZWNzW2tleV0uY29sVHlwZSAhPT0gJ251bScgJiYgdmFsICE9PSAnLicpIHx8XG4gICAgICAgICAgKHR5cGUgPT09ICdzdHJpbmcnICYmICEodmFsIGluc3RhbmNlb2YgRGF0ZSkgJiYgc3BlY3Nba2V5XS5jb2xUeXBlICE9PSAnc3RyaW5nJykgfHxcbiAgICAgICAgICAodmFsIGluc3RhbmNlb2YgRGF0ZSAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdkYXRlJykgfHxcbiAgICAgICAgICAoKHR5cGUgPT09ICdvYmplY3QnICYmIHZhbC5jb25zdHJ1Y3RvciAhPT0gRGF0ZSkgJiYgc3BlY3Nba2V5XS5jb2xUeXBlICE9PSAnanNvbicpKVxuICAgICAgICB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ1RoZXJlIGlzIGEgc3BlY3MgbWlzbWF0Y2ggaW4gdGhlIGFycmF5IGJldHdlZW4gdmFsdWVzIChjb2x1bW5zKSBvZiB0aGUgc2FtZSBuYW1lLicpO1xuICAgICAgICB9IGVsc2UgaWYoIWlzU3BlY3NQcm92aWRlZCAmJiB0eXBlID09PSAnc3RyaW5nJyAmJiBzcGVjc1trZXldLmNvbExlbmd0aCA8IHZhbC5sZW5ndGgpIHtcbiAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IHZhbC5sZW5ndGg7XG4gICAgICAgIH0gZWxzZSBpZigodHlwZSA9PT0gJ3N0cmluZycgJiYgc3BlY3Nba2V5XS5jb2xMZW5ndGggPCB2YWwubGVuZ3RoKSB8fCAodHlwZSAhPT0gJ3N0cmluZycgJiYgc3BlY3Nba2V5XS5jb2xMZW5ndGggIT09IDgpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ1RoZXJlIGlzIGEgc3BlY3MgbWlzbWF0Y2ggaW4gdGhlIGFycmF5IGJldHdlZW4gdmFsdWVzIChjb2x1bW5zKSBvZiB0aGUgc2FtZSBuYW1lLicpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHZhbCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgICB2YWwgPSB0b1Nhc0RhdGVUaW1lKHZhbCk7XG4gICAgICAgIH1cblxuICAgICAgICBzd2l0Y2goc3BlY3Nba2V5XS5jb2xUeXBlKSB7XG4gICAgICAgICAgY2FzZSAnbnVtJzpcbiAgICAgICAgICBjYXNlICdkYXRlJzpcbiAgICAgICAgICAgIHNhc0NzdiArPSB2YWw7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgc2FzQ3N2ICs9ICdcIicgKyB2YWwucmVwbGFjZSgvXCIvZywgJ1wiXCInKSArICdcIic7XG4gICAgICAgICAgICB2YXIgY29sTGVuZ3RoID0gdmFsLmxlbmd0aDtcbiAgICAgICAgICAgIGZvcih2YXIgayA9IDA7IGsgPCB2YWwubGVuZ3RoOyBrKyspIHtcbiAgICAgICAgICAgICAgaWYoc3BlY2lhbENoYXJzLmluZGV4T2YodmFsW2tdKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBjb2xMZW5ndGgrKztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgY29kZSA9IHZhbC5jaGFyQ29kZUF0KGspO1xuICAgICAgICAgICAgICAgIGlmKGNvZGUgPiAweGZmZmYpIHtcbiAgICAgICAgICAgICAgICAgIGNvbExlbmd0aCArPSAzO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihjb2RlID4gMHg3ZmYpIHtcbiAgICAgICAgICAgICAgICAgIGNvbExlbmd0aCArPSAyO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihjb2RlID4gMHg3Zikge1xuICAgICAgICAgICAgICAgICAgY29sTGVuZ3RoICs9IDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB1c2UgbWF4aW11bSB2YWx1ZSBiZXR3ZWVuIG1heCBwcmV2aW91cywgY3VycmVudCB2YWx1ZSBhbmQgMSAoZmlyc3QgdHdvIGNhbiBiZSAwIHdpY2ggaXMgbm90IHN1cHBvcnRlZClcbiAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gTWF0aC5tYXgoc3BlY3Nba2V5XS5jb2xMZW5ndGgsIGNvbExlbmd0aCwgMSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgc2FzQ3N2ICs9ICdcIicgKyBKU09OLnN0cmluZ2lkeSh2YWwpLnJlcGxhY2UoL1wiL2csICdcIlwiJykgKyAnXCInO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIGRvIG5vdCBpbnNlcnQgaWYgaXQncyB0aGUgbGFzdCBjb2x1bW5cbiAgICAgIGlmKGogPCBzcGVjS2V5cy5sZW5ndGggLSAxKSB7XG4gICAgICAgIHNhc0NzdiArPSAnLCc7XG4gICAgICB9XG4gICAgfVxuICAgIGlmKGkgPCB0YWJsZS5sZW5ndGggLSAxKSB7XG4gICAgICBzYXNDc3YgKz0gJ1xcbic7XG4gICAgfVxuICB9XG5cbiAgLy9jb252ZXJ0IHNwZWNzIHRvIGNzdiB3aXRoIHBpcGVzXG4gIHZhciBzcGVjU3RyaW5nID0gc3BlY0tleXMubWFwKGZ1bmN0aW9uKGtleSkge1xuICAgIHJldHVybiBrZXkgKyAnLCcgKyBzcGVjc1trZXldLmNvbFR5cGUgKyAnLCcgKyBzcGVjc1trZXldLmNvbExlbmd0aDtcbiAgfSkuam9pbignfCcpO1xuXG4gIHRoaXMuX2ZpbGVzW21hY3JvTmFtZV0gPSBbXG4gICAgc3BlY1N0cmluZyxcbiAgICBuZXcgQmxvYihbc2FzQ3N2XSwge3R5cGU6ICd0ZXh0L2NzdjtjaGFyc2V0PVVURi04J30pXG4gIF07XG59O1xuXG5TYXNEYXRhLnByb3RvdHlwZS5hZGRGaWxlICA9IGZ1bmN0aW9uKGZpbGUsIG1hY3JvTmFtZSkge1xuICBGaWxlcy5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgZmlsZSwgbWFjcm9OYW1lKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU2FzRGF0YTtcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG4vKlxuKiBoNTRzIHRhYmxlcyBvYmplY3QgY29uc3RydWN0b3JcbiogQGNvbnN0cnVjdG9yXG4qXG4qQHBhcmFtIHthcnJheX0gdGFibGUgLSBUYWJsZSBhZGRlZCB3aGVuIG9iamVjdCBpcyBjcmVhdGVkXG4qQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIG1hY3JvIG5hbWVcbipAcGFyYW0ge251bWJlcn0gcGFyYW1ldGVyVGhyZXNob2xkIC0gc2l6ZSBvZiBkYXRhIG9iamVjdHMgc2VudCB0byBTQVNcbipcbiovXG5mdW5jdGlvbiBUYWJsZXModGFibGUsIG1hY3JvTmFtZSwgcGFyYW1ldGVyVGhyZXNob2xkKSB7XG4gIHRoaXMuX3RhYmxlcyA9IHt9O1xuICB0aGlzLl9wYXJhbWV0ZXJUaHJlc2hvbGQgPSBwYXJhbWV0ZXJUaHJlc2hvbGQgfHwgMzAwMDA7XG5cbiAgVGFibGVzLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCB0YWJsZSwgbWFjcm9OYW1lKTtcbn1cblxuLypcbiogQWRkIHRhYmxlIHRvIHRhYmxlcyBvYmplY3RcbiogQHBhcmFtIHthcnJheX0gdGFibGUgLSBBcnJheSBvZiB0YWJsZSBvYmplY3RzXG4qIEBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBTYXMgbWFjcm8gbmFtZVxuKlxuKi9cblRhYmxlcy5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24odGFibGUsIG1hY3JvTmFtZSkge1xuICBpZih0YWJsZSAmJiBtYWNyb05hbWUpIHtcbiAgICBpZighKHRhYmxlIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgYXJyYXknKTtcbiAgICB9XG4gICAgaWYodHlwZW9mIG1hY3JvTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XG4gICAgfVxuICAgIGlmKCFpc05hTihtYWNyb05hbWVbbWFjcm9OYW1lLmxlbmd0aCAtIDFdKSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNYWNybyBuYW1lIGNhbm5vdCBoYXZlIG51bWJlciBhdCB0aGUgZW5kJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBhcmd1bWVudHMnKTtcbiAgfVxuXG4gIHZhciByZXN1bHQgPSB0aGlzLl91dGlscy5jb252ZXJ0VGFibGVPYmplY3QodGFibGUsIHRoaXMuX3BhcmFtZXRlclRocmVzaG9sZCk7XG5cbiAgdmFyIHRhYmxlQXJyYXkgPSBbXTtcbiAgdGFibGVBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KHJlc3VsdC5zcGVjKSk7XG4gIGZvciAodmFyIG51bWJlck9mVGFibGVzID0gMDsgbnVtYmVyT2ZUYWJsZXMgPCByZXN1bHQuZGF0YS5sZW5ndGg7IG51bWJlck9mVGFibGVzKyspIHtcbiAgICB2YXIgb3V0U3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocmVzdWx0LmRhdGFbbnVtYmVyT2ZUYWJsZXNdKTtcbiAgICB0YWJsZUFycmF5LnB1c2gob3V0U3RyaW5nKTtcbiAgfVxuICB0aGlzLl90YWJsZXNbbWFjcm9OYW1lXSA9IHRhYmxlQXJyYXk7XG59O1xuXG5UYWJsZXMucHJvdG90eXBlLl91dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBUYWJsZXM7XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcbnZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xuXG4vKlxuKiBDb252ZXJ0IHRhYmxlIG9iamVjdCB0byBTYXMgcmVhZGFibGUgb2JqZWN0XG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBpbk9iamVjdCAtIE9iamVjdCB0byBjb252ZXJ0XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuY29udmVydFRhYmxlT2JqZWN0ID0gZnVuY3Rpb24oaW5PYmplY3QsIGNodW5rVGhyZXNob2xkKSB7XG4gIHZhciBzZWxmICAgICAgICAgICAgPSB0aGlzO1xuXG4gIGlmKGNodW5rVGhyZXNob2xkID4gMzAwMDApIHtcbiAgICBjb25zb2xlLndhcm4oJ1lvdSBzaG91bGQgbm90IHNldCB0aHJlc2hvbGQgbGFyZ2VyIHRoYW4gMzBrYiBiZWNhdXNlIG9mIHRoZSBTQVMgbGltaXRhdGlvbnMnKTtcbiAgfVxuXG4gIC8vIGZpcnN0IGNoZWNrIHRoYXQgdGhlIG9iamVjdCBpcyBhbiBhcnJheVxuICBpZiAodHlwZW9mIChpbk9iamVjdCkgIT09ICdvYmplY3QnKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUaGUgcGFyYW1ldGVyIHBhc3NlZCB0byBjaGVja0FuZEdldFR5cGVPYmplY3QgaXMgbm90IGFuIG9iamVjdCcpO1xuICB9XG5cbiAgdmFyIGFycmF5TGVuZ3RoID0gaW5PYmplY3QubGVuZ3RoO1xuICBpZiAodHlwZW9mIChhcnJheUxlbmd0aCkgIT09ICdudW1iZXInKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUaGUgcGFyYW1ldGVyIHBhc3NlZCB0byBjaGVja0FuZEdldFR5cGVPYmplY3QgZG9lcyBub3QgaGF2ZSBhIHZhbGlkIGxlbmd0aCBhbmQgaXMgbW9zdCBsaWtlbHkgbm90IGFuIGFycmF5Jyk7XG4gIH1cblxuICB2YXIgZXhpc3RpbmdDb2xzID0ge307IC8vIHRoaXMgaXMganVzdCB0byBtYWtlIGxvb2t1cCBlYXNpZXIgcmF0aGVyIHRoYW4gdHJhdmVyc2luZyBhcnJheSBlYWNoIHRpbWUuIFdpbGwgdHJhbnNmb3JtIGFmdGVyXG5cbiAgLy8gZnVuY3Rpb24gY2hlY2tBbmRTZXRBcnJheSAtIHRoaXMgd2lsbCBjaGVjayBhbiBpbk9iamVjdCBjdXJyZW50IGtleSBhZ2FpbnN0IHRoZSBleGlzdGluZyB0eXBlQXJyYXkgYW5kIGVpdGhlciByZXR1cm4gLTEgaWYgdGhlcmVcbiAgLy8gaXMgYSB0eXBlIG1pc21hdGNoIG9yIGFkZCBhbiBlbGVtZW50IGFuZCB1cGRhdGUvaW5jcmVtZW50IHRoZSBsZW5ndGggaWYgbmVlZGVkXG5cbiAgZnVuY3Rpb24gY2hlY2tBbmRJbmNyZW1lbnQoY29sU3BlYykge1xuICAgIGlmICh0eXBlb2YgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdICAgICAgICAgICA9IHt9O1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTmFtZSAgID0gY29sU3BlYy5jb2xOYW1lO1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sVHlwZSAgID0gY29sU3BlYy5jb2xUeXBlO1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoID0gY29sU3BlYy5jb2xMZW5ndGggPiAwID8gY29sU3BlYy5jb2xMZW5ndGggOiAxO1xuICAgICAgcmV0dXJuIDA7IC8vIGFsbCBva1xuICAgIH1cbiAgICAvLyBjaGVjayB0eXBlIG1hdGNoXG4gICAgaWYgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbFR5cGUgIT09IGNvbFNwZWMuY29sVHlwZSkge1xuICAgICAgcmV0dXJuIC0xOyAvLyB0aGVyZSBpcyBhIGZ1ZGdlIGluIHRoZSB0eXBpbmdcbiAgICB9XG4gICAgaWYgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbExlbmd0aCA8IGNvbFNwZWMuY29sTGVuZ3RoKSB7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xMZW5ndGggPSBjb2xTcGVjLmNvbExlbmd0aCA+IDAgPyBjb2xTcGVjLmNvbExlbmd0aCA6IDE7IC8vIGluY3JlbWVudCB0aGUgbWF4IGxlbmd0aCBvZiB0aGlzIGNvbHVtblxuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICB9XG4gIHZhciBjaHVua0FycmF5Q291bnQgICAgICAgICA9IDA7IC8vIHRoaXMgaXMgZm9yIGtlZXBpbmcgdGFicyBvbiBob3cgbG9uZyB0aGUgY3VycmVudCBhcnJheSBzdHJpbmcgd291bGQgYmVcbiAgdmFyIHRhcmdldEFycmF5ICAgICAgICAgICAgID0gW107IC8vIHRoaXMgaXMgdGhlIGFycmF5IG9mIHRhcmdldCBhcnJheXNcbiAgdmFyIGN1cnJlbnRUYXJnZXQgICAgICAgICAgID0gMDtcbiAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0gID0gW107XG4gIHZhciBqICAgICAgICAgICAgICAgICAgICAgICA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaW5PYmplY3QubGVuZ3RoOyBpKyspIHtcbiAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXSA9IHt9O1xuICAgIHZhciBjaHVua1Jvd0NvdW50ICAgICAgICAgICAgID0gMDtcblxuICAgIGZvciAodmFyIGtleSBpbiBpbk9iamVjdFtpXSkge1xuICAgICAgdmFyIHRoaXNTcGVjICA9IHt9O1xuICAgICAgdmFyIHRoaXNWYWx1ZSA9IGluT2JqZWN0W2ldW2tleV07XG5cbiAgICAgIC8vc2tpcCB1bmRlZmluZWQgdmFsdWVzXG4gICAgICBpZih0aGlzVmFsdWUgPT09IHVuZGVmaW5lZCB8fCB0aGlzVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vdGhyb3cgYW4gZXJyb3IgaWYgdGhlcmUncyBOYU4gdmFsdWVcbiAgICAgIGlmKHR5cGVvZiB0aGlzVmFsdWUgPT09ICdudW1iZXInICYmIGlzTmFOKHRoaXNWYWx1ZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ05hTiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgIH1cblxuICAgICAgaWYodGhpc1ZhbHVlID09PSAtSW5maW5pdHkgfHwgdGhpc1ZhbHVlID09PSBJbmZpbml0eSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCB0aGlzVmFsdWUudG9TdHJpbmcoKSArICcgdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICB9XG5cbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gdHJ1ZSB8fCB0aGlzVmFsdWUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdCb29sZWFuIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgfVxuXG4gICAgICAvLyBnZXQgdHlwZS4uLiBpZiBpdCBpcyBhbiBvYmplY3QgdGhlbiBjb252ZXJ0IGl0IHRvIGpzb24gYW5kIHN0b3JlIGFzIGEgc3RyaW5nXG4gICAgICB2YXIgdGhpc1R5cGUgID0gdHlwZW9mICh0aGlzVmFsdWUpO1xuXG4gICAgICBpZiAodGhpc1R5cGUgPT09ICdudW1iZXInKSB7IC8vIHN0cmFpZ2h0Zm9yd2FyZCBudW1iZXJcbiAgICAgICAgaWYodGhpc1ZhbHVlIDwgTnVtYmVyLk1JTl9TQUZFX0lOVEVHRVIgfHwgdGhpc1ZhbHVlID4gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHtcbiAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdPYmplY3RbJyArIGkgKyAnXS4nICsga2V5ICsgJyAtIFRoaXMgdmFsdWUgZXhjZWVkcyBleHBlY3RlZCBudW1lcmljIHByZWNpc2lvbi4nKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgICAgICAgICAgICAgICAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICAgICAgICAgICAgICAgICAgPSAnbnVtJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICAgICAgICAgICAgICAgICAgPSA4O1xuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoICAgICAgICAgICAgICA9IHRoaXNWYWx1ZS50b1N0cmluZygpLmxlbmd0aDtcbiAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSAgPSB0aGlzVmFsdWU7XG4gICAgICB9IGVsc2UgaWYgKHRoaXNUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgID0gJ3N0cmluZyc7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgPSB0aGlzVmFsdWUubGVuZ3RoO1xuXG4gICAgICAgIGlmICh0aGlzVmFsdWUgPT09IFwiXCIpIHtcbiAgICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldID0gXCIgXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSA9IGVuY29kZVVSSUNvbXBvbmVudCh0aGlzVmFsdWUpLnJlcGxhY2UoLycvZywgJyUyNycpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldLmxlbmd0aDtcbiAgICAgIH0gZWxzZSBpZih0aGlzVmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdEYXRlIHR5cGUgbm90IHN1cHBvcnRlZC4gUGxlYXNlIHVzZSBoNTRzLnRvU2FzRGF0ZVRpbWUgZnVuY3Rpb24gdG8gY29udmVydCBpdCcpO1xuICAgICAgfSBlbHNlIGlmICh0aGlzVHlwZSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgICAgICAgICAgICAgICAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICAgICAgICAgICAgICAgICAgPSAnanNvbic7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgICAgICAgICAgICAgICAgID0gSlNPTi5zdHJpbmdpZnkodGhpc1ZhbHVlKS5sZW5ndGg7XG4gICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KHRoaXNWYWx1ZSkpLnJlcGxhY2UoLycvZywgJyUyNycpO1xuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoICAgICAgICAgICAgICA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0ubGVuZ3RoO1xuICAgICAgfVxuXG4gICAgICBjaHVua1Jvd0NvdW50ID0gY2h1bmtSb3dDb3VudCArIDYgKyBrZXkubGVuZ3RoICsgdGhpc1NwZWMuZW5jb2RlZExlbmd0aDtcblxuICAgICAgaWYgKGNoZWNrQW5kSW5jcmVtZW50KHRoaXNTcGVjKSA9PSAtMSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnVGhlcmUgaXMgYSB0eXBlIG1pc21hdGNoIGluIHRoZSBhcnJheSBiZXR3ZWVuIHZhbHVlcyAoY29sdW1ucykgb2YgdGhlIHNhbWUgbmFtZS4nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL3JlbW92ZSBsYXN0IGFkZGVkIHJvdyBpZiBpdCdzIGVtcHR5XG4gICAgaWYoT2JqZWN0LmtleXModGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal0pLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0uc3BsaWNlKGosIDEpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGNodW5rUm93Q291bnQgPiBjaHVua1RocmVzaG9sZCkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdSb3cgJyArIGogKyAnIGV4Y2VlZHMgc2l6ZSBsaW1pdCBvZiAzMmtiJyk7XG4gICAgfSBlbHNlIGlmKGNodW5rQXJyYXlDb3VudCArIGNodW5rUm93Q291bnQgPiBjaHVua1RocmVzaG9sZCkge1xuICAgICAgLy9jcmVhdGUgbmV3IGFycmF5IGlmIHRoaXMgb25lIGlzIGZ1bGwgYW5kIG1vdmUgdGhlIGxhc3QgaXRlbSB0byB0aGUgbmV3IGFycmF5XG4gICAgICB2YXIgbGFzdFJvdyA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdLnBvcCgpOyAvLyBnZXQgcmlkIG9mIHRoYXQgbGFzdCByb3dcbiAgICAgIGN1cnJlbnRUYXJnZXQrKzsgLy8gbW92ZSBvbnRvIHRoZSBuZXh0IGFycmF5XG4gICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XSAgPSBbbGFzdFJvd107IC8vIG1ha2UgaXQgYW4gYXJyYXlcbiAgICAgIGogICAgICAgICAgICAgICAgICAgICAgICAgICA9IDA7IC8vIGluaXRpYWxpc2UgbmV3IHJvdyBjb3VudGVyIGZvciBuZXcgYXJyYXkgLSBpdCB3aWxsIGJlIGluY3JlbWVudGVkIGF0IHRoZSBlbmQgb2YgdGhlIGZ1bmN0aW9uXG4gICAgICBjaHVua0FycmF5Q291bnQgICAgICAgICAgICAgPSBjaHVua1Jvd0NvdW50OyAvLyB0aGlzIGlzIHRoZSBuZXcgY2h1bmsgbWF4IHNpemVcbiAgICB9IGVsc2Uge1xuICAgICAgY2h1bmtBcnJheUNvdW50ID0gY2h1bmtBcnJheUNvdW50ICsgY2h1bmtSb3dDb3VudDtcbiAgICB9XG4gICAgaisrO1xuICB9XG5cbiAgLy8gcmVmb3JtYXQgZXhpc3RpbmdDb2xzIGludG8gYW4gYXJyYXkgc28gc2FzIGNhbiBwYXJzZSBpdDtcbiAgdmFyIHNwZWNBcnJheSA9IFtdO1xuICBmb3IgKHZhciBrIGluIGV4aXN0aW5nQ29scykge1xuICAgIHNwZWNBcnJheS5wdXNoKGV4aXN0aW5nQ29sc1trXSk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBzcGVjOiAgICAgICBzcGVjQXJyYXksXG4gICAgZGF0YTogICAgICAgdGFyZ2V0QXJyYXksXG4gICAganNvbkxlbmd0aDogY2h1bmtBcnJheUNvdW50XG4gIH07IC8vIHRoZSBzcGVjIHdpbGwgYmUgdGhlIG1hY3JvWzBdLCB3aXRoIHRoZSBkYXRhIHNwbGl0IGludG8gYXJyYXlzIG9mIG1hY3JvWzEtbl1cbiAgLy8gbWVhbnMgaW4gdGVybXMgb2YgZG9qbyB4aHIgb2JqZWN0IGF0IGxlYXN0IHRoZXkgbmVlZCB0byBnbyBpbnRvIHRoZSBzYW1lIGFycmF5XG59O1xuXG4vKlxuKiBDb252ZXJ0IGphdmFzY3JpcHQgZGF0ZSB0byBzYXMgdGltZVxuKlxuKiBAcGFyYW0ge29iamVjdH0ganNEYXRlIC0gamF2YXNjcmlwdCBEYXRlIG9iamVjdFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnRvU2FzRGF0ZVRpbWUgPSBmdW5jdGlvbiAoanNEYXRlKSB7XG4gIHZhciBiYXNlZGF0ZSA9IG5ldyBEYXRlKFwiSmFudWFyeSAxLCAxOTYwIDAwOjAwOjAwXCIpO1xuICB2YXIgY3VycmRhdGUgPSBqc0RhdGU7XG5cbiAgLy8gb2Zmc2V0cyBmb3IgVVRDIGFuZCB0aW1lem9uZXMgYW5kIEJTVFxuICB2YXIgYmFzZU9mZnNldCA9IGJhc2VkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcbiAgdmFyIGN1cnJPZmZzZXQgPSBjdXJyZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXG5cbiAgLy8gY29udmVydCBjdXJyZGF0ZSB0byBhIHNhcyBkYXRldGltZVxuICB2YXIgb2Zmc2V0U2VjcyAgICA9IChjdXJyT2Zmc2V0IC0gYmFzZU9mZnNldCkgKiA2MDsgLy8gb2Zmc2V0RGlmZiBpcyBpbiBtaW51dGVzIHRvIHN0YXJ0IHdpdGhcbiAgdmFyIGJhc2VEYXRlU2VjcyAgPSBiYXNlZGF0ZS5nZXRUaW1lKCkgLyAxMDAwOyAvLyBnZXQgcmlkIG9mIG1zXG4gIHZhciBjdXJyZGF0ZVNlY3MgID0gY3VycmRhdGUuZ2V0VGltZSgpIC8gMTAwMDsgLy8gZ2V0IHJpZCBvZiBtc1xuICB2YXIgc2FzRGF0ZXRpbWUgICA9IE1hdGgucm91bmQoY3VycmRhdGVTZWNzIC0gYmFzZURhdGVTZWNzIC0gb2Zmc2V0U2Vjcyk7IC8vIGFkanVzdFxuXG4gIHJldHVybiBzYXNEYXRldGltZTtcbn07XG4iXX0=
