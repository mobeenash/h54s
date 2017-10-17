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
    if(!(file instanceof File)) {
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

  this.remoteConfigUpdateCallbacks = [];
  this._pendingCalls = [];
  this._ajax = require('./methods/ajax.js')();

  _setConfig.call(this, config);

  //override with remote if set
  if(config && config.isRemoteConfig) {
    var self = this;

    this._disableCalls = true;

    // '/base/test/h54sConfig.json' is for the testing with karma
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
      this.hostUrl  = config.hostUrl;
      this.url      = config.hostUrl + this.url;
      this.loginUrl = config.hostUrl + this.loginUrl;
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

//self invoked function module
require('./ie_polyfills.js');

},{"./error.js":1,"./files":2,"./ie_polyfills.js":4,"./methods":7,"./methods/ajax.js":6,"./sasData.js":9,"./tables":10}],4:[function(require,module,exports){
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
      if(!dbg) {
        var done = false;
        try {
          resObj = self._utils.parseRes(res.responseText, sasProgram, params);
          logs.addApplicationLog(resObj.logmessage, sasProgram);

          resObj = self._utils.convertDates(resObj);
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

          resObj = self._utils.convertDates(resObj);
          if(dataObj instanceof Tables) {
            unescapedResObj = self._utils.unescapeValues(resObj);
          } else {
            unescapedResObj = resObj;
          }

          if(resObj.status !== 'success') {
            err = new h54sError('programError', resObj.errormessage, resObj.status);
          }
        } catch(e) {
          if(e instanceof SyntaxError) {
            err = new h54sError('parseError', e.message);
          } else if(e instanceof h54sError) {
            err = e;
          } else {
            err = new h54sError('unknownError', e.message);
            err.stack = e.stack;
          }
        } finally {
          callback(err, unescapedResObj);
        }
      }
    }
  }).error(function(res) {
    logs.addApplicationLog('Request failed with status: ' + res.status, sasProgram);
    callback(new h54sError('httpError', res.statusText));
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
  var self = this;

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
        var sasProgram      = pendingCall.sasProgram;
        var callbackPending = pendingCall.callback;
        var params          = pendingCall.params;

        //update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        if(self.retryAfterLogin) {
          self.call(sasProgram, null, callbackPending, params);
        }
      }
    }
  }).error(function(res) {
    logs.addApplicationLog('Login failed with status code: ' + res.status);
    callback(res.status);
  });
};

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
  var patt    = /ERROR(:\s|\s\d\d)(.*\.|.*\n.*\.)/gm;
  var errors  = res.match(patt);
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

/*
* Convert sas timestamps to javascript Date object
*
* @param {object} obj
*
*/
module.exports.convertDates = function(obj) {
  for (var key in obj) {
    if (typeof obj[key] === 'number' && (key.indexOf('dt_') === 0 || key.indexOf('DT_') === 0)) {
      obj[key] = this.fromSasDateTime(obj[key]);
    } else if(typeof obj === 'object') {
      this.convertDates(obj[key]);
    }
  }
  return obj;
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
  } else if(data instanceof File) {
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
    if(!isNaN(macroName[macroName.length - 1])) {
      throw new h54sError('argumentError', 'Macro name cannot have number at the end');
    }
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
            specs[key].colLength = Math.max(specs[key].colLength, colLength);
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
    new File([sasCsv], 'table.csv', {type: 'text/csv;charset=UTF-8'})
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
      var isDate = thisValue instanceof Date;
      if (thisType === 'number') { // straightforward number
        if(thisValue < Number.MIN_SAFE_INTEGER || thisValue > Number.MAX_SAFE_INTEGER) {
          logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
        }
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'num';
        thisSpec.colLength                  = 8;
        thisSpec.encodedLength              = thisValue.toString().length;
        targetArray[currentTarget][j][key]  = thisValue;
      } else if (thisType === 'string' && !isDate) { // straightforward string
        thisSpec.colName    = key;
        thisSpec.colType    = 'string';
        thisSpec.colLength  = thisValue.length;

        if (thisValue === "") {
          targetArray[currentTarget][j][key] = " ";
        } else {
          targetArray[currentTarget][j][key] = encodeURIComponent(thisValue).replace(/'/g, '%27');
        }
        thisSpec.encodedLength = targetArray[currentTarget][j][key].length;
      } else if(isDate) {
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'date';
        thisSpec.colLength                  = 8;
        targetArray[currentTarget][j][key]  = self.toSasDateTime(thisValue);
        thisSpec.encodedLength              = targetArray[currentTarget][j][key].toString().length;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvZmlsZXMvaW5kZXguanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9pbmRleC5qcyIsInNyYy9tZXRob2RzL3V0aWxzLmpzIiwic3JjL3Nhc0RhdGEuanMiLCJzcmMvdGFibGVzL2luZGV4LmpzIiwic3JjL3RhYmxlcy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5VEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuKiBoNTRzIGVycm9yIGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gRXJyb3IgdHlwZVxuKkBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlIC0gRXJyb3IgbWVzc2FnZVxuKkBwYXJhbSB7c3RyaW5nfSBzdGF0dXMgLSBFcnJvciBzdGF0dXMgcmV0dXJuZWQgZnJvbSBTQVNcbipcbiovXG5mdW5jdGlvbiBoNTRzRXJyb3IodHlwZSwgbWVzc2FnZSwgc3RhdHVzKSB7XG4gIGlmKEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKSB7XG4gICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcyk7XG4gIH1cbiAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgdGhpcy50eXBlICAgID0gdHlwZTtcbiAgdGhpcy5zdGF0dXMgID0gc3RhdHVzO1xufVxuXG5oNTRzRXJyb3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShFcnJvci5wcm90b3R5cGUsIHtcbiAgY29uc3RydWN0b3I6IHtcbiAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICB2YWx1ZTogaDU0c0Vycm9yXG4gIH0sXG4gIG5hbWU6IHtcbiAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICB2YWx1ZTogJ2g1NHNFcnJvcidcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gaDU0c0Vycm9yO1xuIiwidmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5cbi8qXG4qIGg1NHMgU0FTIEZpbGVzIG9iamVjdCBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge2ZpbGV9IGZpbGUgLSBGaWxlIGFkZGVkIHdoZW4gb2JqZWN0IGlzIGNyZWF0ZWRcbipAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gbWFjcm8gbmFtZVxuKlxuKi9cbmZ1bmN0aW9uIEZpbGVzKGZpbGUsIG1hY3JvTmFtZSkge1xuICB0aGlzLl9maWxlcyA9IHt9O1xuXG4gIEZpbGVzLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCBmaWxlLCBtYWNyb05hbWUpO1xufVxuXG4vKlxuKiBBZGQgZmlsZSB0byBmaWxlcyBvYmplY3RcbiogQHBhcmFtIHtmaWxlfSBmaWxlIC0gSW5zdGFuY2Ugb2YgSmF2YVNjcmlwdCBGaWxlIG9iamVjdFxuKiBAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gU2FzIG1hY3JvIG5hbWVcbipcbiovXG5GaWxlcy5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24oZmlsZSwgbWFjcm9OYW1lKSB7XG4gIGlmKGZpbGUgJiYgbWFjcm9OYW1lKSB7XG4gICAgaWYoIShmaWxlIGluc3RhbmNlb2YgRmlsZSkpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgYXJndW1lbnQgbXVzdCBiZSBpbnN0YW5jZSBvZiBGaWxlIG9iamVjdCcpO1xuICAgIH1cbiAgICBpZih0eXBlb2YgbWFjcm9OYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdTZWNvbmQgYXJndW1lbnQgbXVzdCBiZSBzdHJpbmcnKTtcbiAgICB9XG4gICAgaWYoIWlzTmFOKG1hY3JvTmFtZVttYWNyb05hbWUubGVuZ3RoIC0gMV0pKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01hY3JvIG5hbWUgY2Fubm90IGhhdmUgbnVtYmVyIGF0IHRoZSBlbmQnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGFyZ3VtZW50cycpO1xuICB9XG5cbiAgdGhpcy5fZmlsZXNbbWFjcm9OYW1lXSA9IFtcbiAgICAnRklMRScsXG4gICAgZmlsZVxuICBdO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBGaWxlcztcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuL2Vycm9yLmpzJyk7XG5cbi8qXG4qIFJlcHJlc2VudHMgaHRtbDUgZm9yIHNhcyBhZGFwdGVyXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7b2JqZWN0fSBjb25maWcgLSBhZGFwdGVyIGNvbmZpZyBvYmplY3QsIHdpdGgga2V5cyBsaWtlIHVybCwgZGVidWcsIGV0Yy5cbipcbiovXG52YXIgaDU0cyA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oY29uZmlnKSB7XG5cbiAgLy9kZWZhdWx0IGNvbmZpZyB2YWx1ZXNcbiAgdGhpcy5tYXhYaHJSZXRyaWVzICAgICAgICA9IDU7XG4gIHRoaXMudXJsICAgICAgICAgICAgICAgICAgPSBcIi9TQVNTdG9yZWRQcm9jZXNzL2RvXCI7XG4gIHRoaXMuZGVidWcgICAgICAgICAgICAgICAgPSBmYWxzZTtcbiAgdGhpcy5sb2dpblVybCAgICAgICAgICAgICA9ICcvU0FTTG9nb24vTG9nb24uZG8nO1xuICB0aGlzLnJldHJ5QWZ0ZXJMb2dpbiAgICAgID0gdHJ1ZTtcbiAgdGhpcy5hamF4VGltZW91dCAgICAgICAgICA9IDMwMDAwO1xuICB0aGlzLnVzZU11bHRpcGFydEZvcm1EYXRhID0gdHJ1ZTtcblxuICB0aGlzLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcyA9IFtdO1xuICB0aGlzLl9wZW5kaW5nQ2FsbHMgPSBbXTtcbiAgdGhpcy5fYWpheCA9IHJlcXVpcmUoJy4vbWV0aG9kcy9hamF4LmpzJykoKTtcblxuICBfc2V0Q29uZmlnLmNhbGwodGhpcywgY29uZmlnKTtcblxuICAvL292ZXJyaWRlIHdpdGggcmVtb3RlIGlmIHNldFxuICBpZihjb25maWcgJiYgY29uZmlnLmlzUmVtb3RlQ29uZmlnKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdGhpcy5fZGlzYWJsZUNhbGxzID0gdHJ1ZTtcblxuICAgIC8vICcvYmFzZS90ZXN0L2g1NHNDb25maWcuanNvbicgaXMgZm9yIHRoZSB0ZXN0aW5nIHdpdGgga2FybWFcbiAgICAvL3JlcGxhY2VkIHdpdGggZ3VscCBpbiBkZXYgYnVpbGRcbiAgICB0aGlzLl9hamF4LmdldCgnL2Jhc2UvdGVzdC9oNTRzQ29uZmlnLmpzb24nKS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xuICAgICAgdmFyIHJlbW90ZUNvbmZpZyA9IEpTT04ucGFyc2UocmVzLnJlc3BvbnNlVGV4dCk7XG5cbiAgICAgIGZvcih2YXIga2V5IGluIHJlbW90ZUNvbmZpZykge1xuICAgICAgICBpZihyZW1vdGVDb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSAmJiBjb25maWdba2V5XSA9PT0gdW5kZWZpbmVkICYmIGtleSAhPT0gJ2lzUmVtb3RlQ29uZmlnJykge1xuICAgICAgICAgIGNvbmZpZ1trZXldID0gcmVtb3RlQ29uZmlnW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgX3NldENvbmZpZy5jYWxsKHNlbGYsIGNvbmZpZyk7XG5cbiAgICAgIC8vZXhlY3V0ZSBjYWxsYmFja3Mgd2hlbiB3ZSBoYXZlIHJlbW90ZSBjb25maWdcbiAgICAgIC8vbm90ZSB0aGF0IHJlbW90ZSBjb25pZmcgaXMgbWVyZ2VkIHdpdGggaW5zdGFuY2UgY29uZmlnXG4gICAgICBmb3IodmFyIGkgPSAwLCBuID0gc2VsZi5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIHZhciBmbiA9IHNlbGYucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzW2ldO1xuICAgICAgICBmbigpO1xuICAgICAgfVxuXG4gICAgICAvL2V4ZWN1dGUgc2FzIGNhbGxzIGRpc2FibGVkIHdoaWxlIHdhaXRpbmcgZm9yIHRoZSBjb25maWdcbiAgICAgIHNlbGYuX2Rpc2FibGVDYWxscyA9IGZhbHNlO1xuICAgICAgd2hpbGUoc2VsZi5fcGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFyIHBlbmRpbmdDYWxsID0gc2VsZi5fcGVuZGluZ0NhbGxzLnNoaWZ0KCk7XG4gICAgICAgIHZhciBzYXNQcm9ncmFtICA9IHBlbmRpbmdDYWxsLnNhc1Byb2dyYW07XG4gICAgICAgIHZhciBjYWxsYmFjayAgICA9IHBlbmRpbmdDYWxsLmNhbGxiYWNrO1xuICAgICAgICB2YXIgcGFyYW1zICAgICAgPSBwZW5kaW5nQ2FsbC5wYXJhbXM7XG5cbiAgICAgICAgLy91cGRhdGUgcHJvZ3JhbSB3aXRoIG1ldGFkYXRhUm9vdCBpZiBpdCdzIG5vdCBzZXRcbiAgICAgICAgaWYoc2VsZi5tZXRhZGF0YVJvb3QgJiYgcGVuZGluZ0NhbGwucGFyYW1zLl9wcm9ncmFtLmluZGV4T2Yoc2VsZi5tZXRhZGF0YVJvb3QpID09PSAtMSkge1xuICAgICAgICAgIHBlbmRpbmdDYWxsLnBhcmFtcy5fcHJvZ3JhbSA9IHNlbGYubWV0YWRhdGFSb290LnJlcGxhY2UoL1xcLz8kLywgJy8nKSArIHBlbmRpbmdDYWxsLnBhcmFtcy5fcHJvZ3JhbS5yZXBsYWNlKC9eXFwvLywgJycpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy91cGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxuICAgICAgICBwYXJhbXMuX2RlYnVnID0gc2VsZi5kZWJ1ZyA/IDEzMSA6IDA7XG5cbiAgICAgICAgc2VsZi5jYWxsKHNhc1Byb2dyYW0sIG51bGwsIGNhbGxiYWNrLCBwYXJhbXMpO1xuICAgICAgfVxuICAgIH0pLmVycm9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FqYXhFcnJvcicsICdSZW1vdGUgY29uZmlnIGZpbGUgY2Fubm90IGJlIGxvYWRlZC4gSHR0cCBzdGF0dXMgY29kZTogJyArIGVyci5zdGF0dXMpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gcHJpdmF0ZSBmdW5jdGlvbiB0byBzZXQgaDU0cyBpbnN0YW5jZSBwcm9wZXJ0aWVzXG4gIGZ1bmN0aW9uIF9zZXRDb25maWcoY29uZmlnKSB7XG4gICAgaWYoIWNvbmZpZykge1xuICAgICAgdGhpcy5fYWpheC5zZXRUaW1lb3V0KHRoaXMuYWpheFRpbWVvdXQpO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZih0eXBlb2YgY29uZmlnICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBwYXJhbWV0ZXIgc2hvdWxkIGJlIGNvbmZpZyBvYmplY3QnKTtcbiAgICB9XG5cbiAgICAvL21lcmdlIGNvbmZpZyBvYmplY3QgZnJvbSBwYXJhbWV0ZXIgd2l0aCB0aGlzXG4gICAgZm9yKHZhciBrZXkgaW4gY29uZmlnKSB7XG4gICAgICBpZihjb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICBpZigoa2V5ID09PSAndXJsJyB8fCBrZXkgPT09ICdsb2dpblVybCcpICYmIGNvbmZpZ1trZXldLmNoYXJBdCgwKSAhPT0gJy8nKSB7XG4gICAgICAgICAgY29uZmlnW2tleV0gPSAnLycgKyBjb25maWdba2V5XTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzW2tleV0gPSBjb25maWdba2V5XTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL2lmIHNlcnZlciBpcyByZW1vdGUgdXNlIHRoZSBmdWxsIHNlcnZlciB1cmxcbiAgICAvL05PVEU6IHRoaXMgaXMgbm90IHBlcm1pdGVkIGJ5IHRoZSBzYW1lLW9yaWdpbiBwb2xpY3lcbiAgICBpZihjb25maWcuaG9zdFVybCkge1xuICAgICAgaWYoY29uZmlnLmhvc3RVcmwuY2hhckF0KGNvbmZpZy5ob3N0VXJsLmxlbmd0aCAtIDEpID09PSAnLycpIHtcbiAgICAgICAgY29uZmlnLmhvc3RVcmwgPSBjb25maWcuaG9zdFVybC5zbGljZSgwLCAtMSk7XG4gICAgICB9XG4gICAgICB0aGlzLmhvc3RVcmwgID0gY29uZmlnLmhvc3RVcmw7XG4gICAgICB0aGlzLnVybCAgICAgID0gY29uZmlnLmhvc3RVcmwgKyB0aGlzLnVybDtcbiAgICAgIHRoaXMubG9naW5VcmwgPSBjb25maWcuaG9zdFVybCArIHRoaXMubG9naW5Vcmw7XG4gICAgfVxuXG4gICAgdGhpcy5fYWpheC5zZXRUaW1lb3V0KHRoaXMuYWpheFRpbWVvdXQpO1xuICB9XG59O1xuXG4vL3JlcGxhY2VkIHdpdGggZ3VscFxuaDU0cy52ZXJzaW9uID0gJ19fdmVyc2lvbl9fJztcblxuXG5oNTRzLnByb3RvdHlwZSA9IHJlcXVpcmUoJy4vbWV0aG9kcycpO1xuXG5oNTRzLlRhYmxlcyA9IHJlcXVpcmUoJy4vdGFibGVzJyk7XG5oNTRzLkZpbGVzID0gcmVxdWlyZSgnLi9maWxlcycpO1xuaDU0cy5TYXNEYXRhID0gcmVxdWlyZSgnLi9zYXNEYXRhLmpzJyk7XG5cbi8vc2VsZiBpbnZva2VkIGZ1bmN0aW9uIG1vZHVsZVxucmVxdWlyZSgnLi9pZV9wb2x5ZmlsbHMuanMnKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gIGlmICghT2JqZWN0LmNyZWF0ZSkge1xuICAgIE9iamVjdC5jcmVhdGUgPSBmdW5jdGlvbihwcm90bywgcHJvcHMpIHtcbiAgICAgIGlmICh0eXBlb2YgcHJvcHMgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgdGhyb3cgXCJUaGUgbXVsdGlwbGUtYXJndW1lbnQgdmVyc2lvbiBvZiBPYmplY3QuY3JlYXRlIGlzIG5vdCBwcm92aWRlZCBieSB0aGlzIGJyb3dzZXIgYW5kIGNhbm5vdCBiZSBzaGltbWVkLlwiO1xuICAgICAgfVxuICAgICAgZnVuY3Rpb24gY3RvcigpIHsgfVxuICAgICAgY3Rvci5wcm90b3R5cGUgPSBwcm90bztcbiAgICAgIHJldHVybiBuZXcgY3RvcigpO1xuICAgIH07XG4gIH1cblxuXG4gIC8vIEZyb20gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvT2JqZWN0L2tleXNcbiAgaWYgKCFPYmplY3Qua2V5cykge1xuICAgIE9iamVjdC5rZXlzID0gKGZ1bmN0aW9uICgpIHtcbiAgICAgICd1c2Ugc3RyaWN0JztcbiAgICAgIHZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHksXG4gICAgICAgICAgaGFzRG9udEVudW1CdWcgPSAhKHt0b1N0cmluZzogbnVsbH0pLnByb3BlcnR5SXNFbnVtZXJhYmxlKCd0b1N0cmluZycpLFxuICAgICAgICAgIGRvbnRFbnVtcyA9IFtcbiAgICAgICAgICAgICd0b1N0cmluZycsXG4gICAgICAgICAgICAndG9Mb2NhbGVTdHJpbmcnLFxuICAgICAgICAgICAgJ3ZhbHVlT2YnLFxuICAgICAgICAgICAgJ2hhc093blByb3BlcnR5JyxcbiAgICAgICAgICAgICdpc1Byb3RvdHlwZU9mJyxcbiAgICAgICAgICAgICdwcm9wZXJ0eUlzRW51bWVyYWJsZScsXG4gICAgICAgICAgICAnY29uc3RydWN0b3InXG4gICAgICAgICAgXSxcbiAgICAgICAgICBkb250RW51bXNMZW5ndGggPSBkb250RW51bXMubGVuZ3RoO1xuXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKG9iaikge1xuICAgICAgICBpZiAodHlwZW9mIG9iaiAhPT0gJ29iamVjdCcgJiYgKHR5cGVvZiBvYmogIT09ICdmdW5jdGlvbicgfHwgb2JqID09PSBudWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ09iamVjdC5rZXlzIGNhbGxlZCBvbiBub24tb2JqZWN0Jyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmVzdWx0ID0gW10sIHByb3AsIGk7XG5cbiAgICAgICAgZm9yIChwcm9wIGluIG9iaikge1xuICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCkpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKHByb3ApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChoYXNEb250RW51bUJ1Zykge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBkb250RW51bXNMZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqLCBkb250RW51bXNbaV0pKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGRvbnRFbnVtc1tpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9O1xuICAgIH0oKSk7XG4gIH1cblxuICAvLyBGcm9tIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL0FycmF5L2xhc3RJbmRleE9mXG4gIGlmICghQXJyYXkucHJvdG90eXBlLmxhc3RJbmRleE9mKSB7XG4gICAgQXJyYXkucHJvdG90eXBlLmxhc3RJbmRleE9mID0gZnVuY3Rpb24oc2VhcmNoRWxlbWVudCAvKiwgZnJvbUluZGV4Ki8pIHtcbiAgICAgICd1c2Ugc3RyaWN0JztcblxuICAgICAgaWYgKHRoaXMgPT09IHZvaWQgMCB8fCB0aGlzID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoKTtcbiAgICAgIH1cblxuICAgICAgdmFyIG4sIGssXG4gICAgICAgIHQgPSBPYmplY3QodGhpcyksXG4gICAgICAgIGxlbiA9IHQubGVuZ3RoID4+PiAwO1xuICAgICAgaWYgKGxlbiA9PT0gMCkge1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgICB9XG5cbiAgICAgIG4gPSBsZW4gLSAxO1xuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIG4gPSBOdW1iZXIoYXJndW1lbnRzWzFdKTtcbiAgICAgICAgaWYgKG4gIT0gbikge1xuICAgICAgICAgIG4gPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG4gIT09IDAgJiYgbiAhPSAoMSAvIDApICYmIG4gIT0gLSgxIC8gMCkpIHtcbiAgICAgICAgICBuID0gKG4gPiAwIHx8IC0xKSAqIE1hdGguZmxvb3IoTWF0aC5hYnMobikpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAoayA9IG4gPj0gMCA/IE1hdGgubWluKG4sIGxlbiAtIDEpIDogbGVuIC0gTWF0aC5hYnMobik7IGsgPj0gMDsgay0tKSB7XG4gICAgICAgIGlmIChrIGluIHQgJiYgdFtrXSA9PT0gc2VhcmNoRWxlbWVudCkge1xuICAgICAgICAgIHJldHVybiBrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gLTE7XG4gICAgfTtcbiAgfVxufSgpO1xuIiwidmFyIGxvZ3MgPSB7XG4gIGFwcGxpY2F0aW9uTG9nczogW10sXG4gIGRlYnVnRGF0YTogW10sXG4gIHNhc0Vycm9yczogW10sXG4gIGZhaWxlZFJlcXVlc3RzOiBbXVxufTtcblxudmFyIGxpbWl0cyA9IHtcbiAgYXBwbGljYXRpb25Mb2dzOiAxMDAsXG4gIGRlYnVnRGF0YTogMjAsXG4gIGZhaWxlZFJlcXVlc3RzOiAyMCxcbiAgc2FzRXJyb3JzOiAxMDBcbn07XG5cbm1vZHVsZS5leHBvcnRzLmdldCA9IHtcbiAgZ2V0U2FzRXJyb3JzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5zYXNFcnJvcnM7XG4gIH0sXG4gIGdldEFwcGxpY2F0aW9uTG9nczogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3MuYXBwbGljYXRpb25Mb2dzO1xuICB9LFxuICBnZXREZWJ1Z0RhdGE6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmRlYnVnRGF0YTtcbiAgfSxcbiAgZ2V0RmFpbGVkUmVxdWVzdHM6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmZhaWxlZFJlcXVlc3RzO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5jbGVhciA9IHtcbiAgY2xlYXJBcHBsaWNhdGlvbkxvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnNwbGljZSgwLCBsb2dzLmFwcGxpY2F0aW9uTG9ncy5sZW5ndGgpO1xuICB9LFxuICBjbGVhckRlYnVnRGF0YTogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5kZWJ1Z0RhdGEuc3BsaWNlKDAsIGxvZ3MuZGVidWdEYXRhLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyU2FzRXJyb3JzOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLnNhc0Vycm9ycy5zcGxpY2UoMCwgbG9ncy5zYXNFcnJvcnMubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJGYWlsZWRSZXF1ZXN0czogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5zcGxpY2UoMCwgbG9ncy5mYWlsZWRSZXF1ZXN0cy5sZW5ndGgpO1xuICB9LFxuICBjbGVhckFsbExvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuY2xlYXJBcHBsaWNhdGlvbkxvZ3MoKTtcbiAgICB0aGlzLmNsZWFyRGVidWdEYXRhKCk7XG4gICAgdGhpcy5jbGVhclNhc0Vycm9ycygpO1xuICAgIHRoaXMuY2xlYXJGYWlsZWRSZXF1ZXN0cygpO1xuICB9XG59O1xuXG4vKlxuKiBBZGRzIGFwcGxpY2F0aW9uIGxvZ3MgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkQXBwbGljYXRpb25Mb2cgPSBmdW5jdGlvbihtZXNzYWdlLCBzYXNQcm9ncmFtKSB7XG4gIGlmKG1lc3NhZ2UgPT09ICdibGFuaycpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIGxvZyA9IHtcbiAgICBtZXNzYWdlOiAgICBtZXNzYWdlLFxuICAgIHRpbWU6ICAgICAgIG5ldyBEYXRlKCksXG4gICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbVxuICB9O1xuICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5wdXNoKGxvZyk7XG5cbiAgaWYobG9ncy5hcHBsaWNhdGlvbkxvZ3MubGVuZ3RoID4gbGltaXRzLmFwcGxpY2F0aW9uTG9ncykge1xuICAgIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnNoaWZ0KCk7XG4gIH1cbn07XG5cbi8qXG4qIEFkZHMgZGVidWcgZGF0YSB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGREZWJ1Z0RhdGEgPSBmdW5jdGlvbihodG1sRGF0YSwgZGVidWdUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgbG9ncy5kZWJ1Z0RhdGEucHVzaCh7XG4gICAgZGVidWdIdG1sOiAgaHRtbERhdGEsXG4gICAgZGVidWdUZXh0OiAgZGVidWdUZXh0LFxuICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgcGFyYW1zOiAgICAgcGFyYW1zLFxuICAgIHRpbWU6ICAgICAgIG5ldyBEYXRlKClcbiAgfSk7XG5cbiAgaWYobG9ncy5kZWJ1Z0RhdGEubGVuZ3RoID4gbGltaXRzLmRlYnVnRGF0YSkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNoaWZ0KCk7XG4gIH1cbn07XG5cbi8qXG4qIEFkZHMgZmFpbGVkIHJlcXVlc3RzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEZhaWxlZFJlcXVlc3QgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSkge1xuICBsb2dzLmZhaWxlZFJlcXVlc3RzLnB1c2goe1xuICAgIHJlc3BvbnNlSHRtbDogcmVzcG9uc2VUZXh0LFxuICAgIHJlc3BvbnNlVGV4dDogZGVidWdUZXh0LFxuICAgIHNhc1Byb2dyYW06ICAgc2FzUHJvZ3JhbSxcbiAgICB0aW1lOiAgICAgICAgIG5ldyBEYXRlKClcbiAgfSk7XG5cbiAgLy9tYXggMjAgZmFpbGVkIHJlcXVlc3RzXG4gIGlmKGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoID4gbGltaXRzLmZhaWxlZFJlcXVlc3RzKSB7XG4gICAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5zaGlmdCgpO1xuICB9XG59O1xuXG4vKlxuKiBBZGRzIFNBUyBlcnJvcnMgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkU2FzRXJyb3JzID0gZnVuY3Rpb24oZXJyb3JzKSB7XG4gIGxvZ3Muc2FzRXJyb3JzID0gbG9ncy5zYXNFcnJvcnMuY29uY2F0KGVycm9ycyk7XG5cbiAgd2hpbGUobG9ncy5zYXNFcnJvcnMubGVuZ3RoID4gbGltaXRzLnNhc0Vycm9ycykge1xuICAgIGxvZ3Muc2FzRXJyb3JzLnNoaWZ0KCk7XG4gIH1cbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgdGltZW91dCA9IDMwMDAwO1xuICB2YXIgdGltZW91dEhhbmRsZTtcblxuICB2YXIgeGhyID0gZnVuY3Rpb24odHlwZSwgdXJsLCBkYXRhLCBtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgIHZhciBtZXRob2RzID0ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24oKSB7fSxcbiAgICAgIGVycm9yOiAgIGZ1bmN0aW9uKCkge31cbiAgICB9O1xuICAgIHZhciBYSFIgICAgID0gWE1MSHR0cFJlcXVlc3QgfHwgQWN0aXZlWE9iamVjdDtcbiAgICB2YXIgcmVxdWVzdCA9IG5ldyBYSFIoJ01TWE1MMi5YTUxIVFRQLjMuMCcpO1xuXG4gICAgcmVxdWVzdC5vcGVuKHR5cGUsIHVybCwgdHJ1ZSk7XG5cbiAgICAvL211bHRpcGFydC9mb3JtLWRhdGEgaXMgc2V0IGF1dG9tYXRpY2FsbHkgc28gbm8gbmVlZCBmb3IgZWxzZSBibG9ja1xuICAgIGlmKCFtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgICAgcmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyk7XG4gICAgfVxuICAgIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHJlcXVlc3QucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dEhhbmRsZSk7XG4gICAgICAgIGlmIChyZXF1ZXN0LnN0YXR1cyA+PSAyMDAgJiYgcmVxdWVzdC5zdGF0dXMgPCAzMDApIHtcbiAgICAgICAgICBtZXRob2RzLnN1Y2Nlc3MuY2FsbChtZXRob2RzLCByZXF1ZXN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtZXRob2RzLmVycm9yLmNhbGwobWV0aG9kcywgcmVxdWVzdCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgaWYodGltZW91dCA+IDApIHtcbiAgICAgIHRpbWVvdXRIYW5kbGUgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICByZXF1ZXN0LmFib3J0KCk7XG4gICAgICB9LCB0aW1lb3V0KTtcbiAgICB9XG5cbiAgICByZXF1ZXN0LnNlbmQoZGF0YSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIG1ldGhvZHMuc3VjY2VzcyA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH0sXG4gICAgICBlcnJvcjogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIG1ldGhvZHMuZXJyb3IgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG4gICAgfTtcbiAgfTtcblxuICB2YXIgc2VyaWFsaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHN0ciA9IFtdO1xuICAgIGZvcih2YXIgcCBpbiBvYmopIHtcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcbiAgICAgICAgaWYob2JqW3BdIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICBmb3IodmFyIGkgPSAwLCBuID0gb2JqW3BdLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgc3RyLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KHApICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQob2JqW3BdW2ldKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXSkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzdHIuam9pbihcIiZcIik7XG4gIH07XG5cbiAgdmFyIGNyZWF0ZU11bHRpcGFydEZvcm1EYXRhUGF5bG9hZCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBkYXRhID0gbmV3IEZvcm1EYXRhKCk7XG4gICAgZm9yKHZhciBwIGluIG9iaikge1xuICAgICAgaWYob2JqLmhhc093blByb3BlcnR5KHApKSB7XG4gICAgICAgIGlmKG9ialtwXSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgZm9yKHZhciBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXVtpXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH07XG5cbiAgcmV0dXJuIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKHVybCwgZGF0YSkge1xuICAgICAgdmFyIGRhdGFTdHI7XG4gICAgICBpZih0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgZGF0YVN0ciA9IHNlcmlhbGl6ZShkYXRhKTtcbiAgICAgIH1cbiAgICAgIHZhciB1cmxXaXRoUGFyYW1zID0gZGF0YVN0ciA/ICh1cmwgKyAnPycgKyBkYXRhU3RyKSA6IHVybDtcbiAgICAgIHJldHVybiB4aHIoJ0dFVCcsIHVybFdpdGhQYXJhbXMpO1xuICAgIH0sXG4gICAgcG9zdDogZnVuY3Rpb24odXJsLCBkYXRhLCBtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgICAgdmFyIHBheWxvYWQ7XG4gICAgICBpZih0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYobXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICAgICAgICBwYXlsb2FkID0gY3JlYXRlTXVsdGlwYXJ0Rm9ybURhdGFQYXlsb2FkKGRhdGEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBheWxvYWQgPSBzZXJpYWxpemUoZGF0YSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB4aHIoJ1BPU1QnLCB1cmwsIHBheWxvYWQsIG11bHRpcGFydEZvcm1EYXRhKTtcbiAgICB9LFxuICAgIHNldFRpbWVvdXQ6IGZ1bmN0aW9uKHQpIHtcbiAgICAgIHRpbWVvdXQgPSB0O1xuICAgIH1cbiAgfTtcbn07XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcbnZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xudmFyIFRhYmxlcyA9IHJlcXVpcmUoJy4uL3RhYmxlcycpO1xudmFyIFNhc0RhdGEgPSByZXF1aXJlKCcuLi9zYXNEYXRhLmpzJyk7XG52YXIgRmlsZXMgPSByZXF1aXJlKCcuLi9maWxlcycpO1xuXG4vKlxuKiBDYWxsIFNhcyBwcm9ncmFtXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gUGF0aCBvZiB0aGUgc2FzIHByb2dyYW1cbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5jYWxsID0gZnVuY3Rpb24oc2FzUHJvZ3JhbSwgZGF0YU9iaiwgY2FsbGJhY2ssIHBhcmFtcykge1xuICB2YXIgc2VsZiAgICAgICAgPSB0aGlzO1xuICB2YXIgcmV0cnlDb3VudCAgPSAwO1xuICB2YXIgZGJnICAgICAgICAgPSB0aGlzLmRlYnVnO1xuXG4gIGlmICghY2FsbGJhY2sgfHwgdHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKXtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgY2FsbGJhY2snKTtcbiAgfVxuICBpZighc2FzUHJvZ3JhbSkge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBTYXMgcHJvZ3JhbSBmaWxlIHBhdGgnKTtcbiAgfVxuICBpZih0eXBlb2Ygc2FzUHJvZ3JhbSAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IHBhcmFtZXRlciBzaG91bGQgYmUgc3RyaW5nJyk7XG4gIH1cbiAgaWYodGhpcy51c2VNdWx0aXBhcnRGb3JtRGF0YSA9PT0gZmFsc2UgJiYgIShkYXRhT2JqIGluc3RhbmNlb2YgVGFibGVzKSkge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnQ2Fubm90IHNlbmQgZmlsZXMgdXNpbmcgYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkLiBQbGVhc2UgdXNlIFRhYmxlcyBvciBkZWZhdWx0IHZhbHVlIGZvciB1c2VNdWx0aXBhcnRGb3JtRGF0YScpO1xuICB9XG5cbiAgaWYoIXBhcmFtcykge1xuICAgIHBhcmFtcyA9IHtcbiAgICAgIF9wcm9ncmFtOiB0aGlzLl91dGlscy5nZXRGdWxsUHJvZ3JhbVBhdGgodGhpcy5tZXRhZGF0YVJvb3QsIHNhc1Byb2dyYW0pLFxuICAgICAgX2RlYnVnOiAgIHRoaXMuZGVidWcgPyAxMzEgOiAwLFxuICAgICAgX3NlcnZpY2U6ICdkZWZhdWx0JyxcbiAgICB9O1xuICB9XG5cbiAgaWYoZGF0YU9iaikge1xuICAgIHZhciBrZXksIGRhdGFQcm92aWRlcjtcbiAgICBpZihkYXRhT2JqIGluc3RhbmNlb2YgVGFibGVzKSB7XG4gICAgICBkYXRhUHJvdmlkZXIgPSBkYXRhT2JqLl90YWJsZXM7XG4gICAgfSBlbHNlIGlmKGRhdGFPYmogaW5zdGFuY2VvZiBGaWxlcyB8fCBkYXRhT2JqIGluc3RhbmNlb2YgU2FzRGF0YSl7XG4gICAgICBkYXRhUHJvdmlkZXIgPSBkYXRhT2JqLl9maWxlcztcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdXcm9uZyB0eXBlIG9mIHRhYmxlcyBvYmplY3QnKTtcbiAgICB9XG4gICAgZm9yKGtleSBpbiBkYXRhUHJvdmlkZXIpIHtcbiAgICAgIGlmKGRhdGFQcm92aWRlci5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgIHBhcmFtc1trZXldID0gZGF0YVByb3ZpZGVyW2tleV07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYodGhpcy5fZGlzYWJsZUNhbGxzKSB7XG4gICAgdGhpcy5fcGVuZGluZ0NhbGxzLnB1c2goe1xuICAgICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbSxcbiAgICAgIGNhbGxiYWNrOiAgIGNhbGxiYWNrLFxuICAgICAgcGFyYW1zOiAgICAgcGFyYW1zXG4gICAgfSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhpcy5fYWpheC5wb3N0KHRoaXMudXJsLCBwYXJhbXMsIHRoaXMudXNlTXVsdGlwYXJ0Rm9ybURhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgaWYoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XG4gICAgICAvL3JlbWVtYmVyIHRoZSBjYWxsIGZvciBsYXR0ZXIgdXNlXG4gICAgICBzZWxmLl9wZW5kaW5nQ2FsbHMucHVzaCh7XG4gICAgICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgICAgIGNhbGxiYWNrOiAgIGNhbGxiYWNrLFxuICAgICAgICBwYXJhbXM6ICAgICBwYXJhbXNcbiAgICAgIH0pO1xuXG4gICAgICAvL3RoZXJlJ3Mgbm8gbmVlZCB0byBjb250aW51ZSBpZiBwcmV2aW91cyBjYWxsIHJldHVybmVkIGxvZ2luIGVycm9yXG4gICAgICBpZihzZWxmLl9kaXNhYmxlQ2FsbHMpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2VsZi5fZGlzYWJsZUNhbGxzID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgY2FsbGJhY2sobmV3IGg1NHNFcnJvcignbm90TG9nZ2VkaW5FcnJvcicsICdZb3UgYXJlIG5vdCBsb2dnZWQgaW4nKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZXNPYmosIHVuZXNjYXBlZFJlc09iaiwgZXJyO1xuICAgICAgaWYoIWRiZykge1xuICAgICAgICB2YXIgZG9uZSA9IGZhbHNlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlc09iaiA9IHNlbGYuX3V0aWxzLnBhcnNlUmVzKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcyk7XG4gICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhyZXNPYmoubG9nbWVzc2FnZSwgc2FzUHJvZ3JhbSk7XG5cbiAgICAgICAgICByZXNPYmogPSBzZWxmLl91dGlscy5jb252ZXJ0RGF0ZXMocmVzT2JqKTtcbiAgICAgICAgICBpZihkYXRhT2JqIGluc3RhbmNlb2YgVGFibGVzKSB7XG4gICAgICAgICAgICB1bmVzY2FwZWRSZXNPYmogPSBzZWxmLl91dGlscy51bmVzY2FwZVZhbHVlcyhyZXNPYmopO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1bmVzY2FwZWRSZXNPYmogPSByZXNPYmo7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYocmVzT2JqLnN0YXR1cyAhPT0gJ3N1Y2Nlc3MnKSB7XG4gICAgICAgICAgICBlcnIgPSBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtRXJyb3InLCByZXNPYmouZXJyb3JtZXNzYWdlLCByZXNPYmouc3RhdHVzKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgaWYoZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB7XG4gICAgICAgICAgICBpZihyZXRyeUNvdW50IDwgc2VsZi5tYXhYaHJSZXRyaWVzKSB7XG4gICAgICAgICAgICAgIGRvbmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgc2VsZi5fYWpheC5wb3N0KHNlbGYudXJsLCBwYXJhbXMsIHNlbGYudXNlTXVsdGlwYXJ0Rm9ybURhdGEpLnN1Y2Nlc3ModGhpcy5zdWNjZXNzKS5lcnJvcih0aGlzLmVycm9yKTtcbiAgICAgICAgICAgICAgcmV0cnlDb3VudCsrO1xuICAgICAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKFwiUmV0cnlpbmcgI1wiICsgcmV0cnlDb3VudCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICAgIHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgICBlcnIgPSBuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJyk7XG4gICAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZihlIGluc3RhbmNlb2YgaDU0c0Vycm9yKSB7XG4gICAgICAgICAgICBzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICBzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIGVyciA9IGU7XG4gICAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5fdXRpbHMucGFyc2VFcnJvclJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgc2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICBlcnIgPSBuZXcgaDU0c0Vycm9yKCd1bmtub3duRXJyb3InLCBlLm1lc3NhZ2UpO1xuICAgICAgICAgICAgZXJyLnN0YWNrID0gZS5zdGFjaztcbiAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICBpZihkb25lKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIsIHVuZXNjYXBlZFJlc09iaik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlc09iaiA9IHNlbGYuX3V0aWxzLnBhcnNlRGVidWdSZXMocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKTtcbiAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKHJlc09iai5sb2dtZXNzYWdlLCBzYXNQcm9ncmFtKTtcblxuICAgICAgICAgIHJlc09iaiA9IHNlbGYuX3V0aWxzLmNvbnZlcnREYXRlcyhyZXNPYmopO1xuICAgICAgICAgIGlmKGRhdGFPYmogaW5zdGFuY2VvZiBUYWJsZXMpIHtcbiAgICAgICAgICAgIHVuZXNjYXBlZFJlc09iaiA9IHNlbGYuX3V0aWxzLnVuZXNjYXBlVmFsdWVzKHJlc09iaik7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVuZXNjYXBlZFJlc09iaiA9IHJlc09iajtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZihyZXNPYmouc3RhdHVzICE9PSAnc3VjY2VzcycpIHtcbiAgICAgICAgICAgIGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1FcnJvcicsIHJlc09iai5lcnJvcm1lc3NhZ2UsIHJlc09iai5zdGF0dXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgaWYoZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB7XG4gICAgICAgICAgICBlcnIgPSBuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgZS5tZXNzYWdlKTtcbiAgICAgICAgICB9IGVsc2UgaWYoZSBpbnN0YW5jZW9mIGg1NHNFcnJvcikge1xuICAgICAgICAgICAgZXJyID0gZTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXJyID0gbmV3IGg1NHNFcnJvcigndW5rbm93bkVycm9yJywgZS5tZXNzYWdlKTtcbiAgICAgICAgICAgIGVyci5zdGFjayA9IGUuc3RhY2s7XG4gICAgICAgICAgfVxuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgIGNhbGxiYWNrKGVyciwgdW5lc2NhcGVkUmVzT2JqKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSkuZXJyb3IoZnVuY3Rpb24ocmVzKSB7XG4gICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnUmVxdWVzdCBmYWlsZWQgd2l0aCBzdGF0dXM6ICcgKyByZXMuc3RhdHVzLCBzYXNQcm9ncmFtKTtcbiAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdodHRwRXJyb3InLCByZXMuc3RhdHVzVGV4dCkpO1xuICB9KTtcbn07XG5cbi8qXG4qIExvZ2luIG1ldGhvZFxuKlxuKiBAcGFyYW0ge3N0cmluZ30gdXNlciAtIExvZ2luIHVzZXJuYW1lXG4qIEBwYXJhbSB7c3RyaW5nfSBwYXNzIC0gTG9naW4gcGFzc3dvcmRcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiogT1JcbipcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5sb2dpbiA9IGZ1bmN0aW9uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZighdXNlciB8fCAhcGFzcykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnQ3JlZGVudGlhbHMgbm90IHNldCcpO1xuICB9XG4gIGlmKHR5cGVvZiB1c2VyICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgcGFzcyAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1VzZXIgYW5kIHBhc3MgcGFyYW1ldGVycyBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgfVxuICAvL05PVEU6IGNhbGxiYWNrIG9wdGlvbmFsP1xuICBpZighY2FsbGJhY2sgfHwgdHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdZb3UgbXVzdCBwcm92aWRlIGNhbGxiYWNrJyk7XG4gIH1cblxuICB2YXIgbG9naW5QYXJhbXMgPSB7XG4gICAgX3NlcnZpY2U6ICdkZWZhdWx0JyxcbiAgICB1eDogdXNlcixcbiAgICBweDogcGFzcyxcbiAgICAvL2ZvciBTQVMgOS40LFxuICAgIHVzZXJuYW1lOiB1c2VyLFxuICAgIHBhc3N3b3JkOiBwYXNzXG4gIH07XG5cbiAgZm9yICh2YXIga2V5IGluIHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zKSB7XG4gICAgbG9naW5QYXJhbXNba2V5XSA9IHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zW2tleV07XG4gIH1cblxuICB0aGlzLl9sb2dpbkF0dGVtcHRzID0gMDtcblxuICB0aGlzLl9hamF4LnBvc3QodGhpcy5sb2dpblVybCwgbG9naW5QYXJhbXMpLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgaWYoKytzZWxmLl9sb2dpbkF0dGVtcHRzID09PSAzKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soLTIpO1xuICAgIH1cblxuICAgIGlmKHNlbGYuX3V0aWxzLm5lZWRUb0xvZ2luLmNhbGwoc2VsZiwgcmVzKSkge1xuICAgICAgLy93ZSBhcmUgZ2V0dGluZyBmb3JtIGFnYWluIGFmdGVyIHJlZGlyZWN0XG4gICAgICAvL2FuZCBuZWVkIHRvIGxvZ2luIGFnYWluIHVzaW5nIHRoZSBuZXcgdXJsXG4gICAgICAvL19sb2dpbkNoYW5nZWQgaXMgc2V0IGluIG5lZWRUb0xvZ2luIGZ1bmN0aW9uXG4gICAgICAvL2J1dCBpZiBsb2dpbiB1cmwgaXMgbm90IGRpZmZlcmVudCwgd2UgYXJlIGNoZWNraW5nIGlmIHRoZXJlIGFyZSBhZGl0aW9uYWwgcGFyYW1ldGVyc1xuICAgICAgaWYoc2VsZi5fbG9naW5DaGFuZ2VkIHx8IChzZWxmLl9pc05ld0xvZ2luUGFnZSAmJiAhc2VsZi5fYWRpdGlvbmFsTG9naW5QYXJhbXMpKSB7XG4gICAgICAgIGRlbGV0ZSBzZWxmLl9sb2dpbkNoYW5nZWQ7XG5cbiAgICAgICAgdmFyIGlucHV0cyA9IHJlcy5yZXNwb25zZVRleHQubWF0Y2goLzxpbnB1dC4qXCJoaWRkZW5cIltePl0qPi9nKTtcbiAgICAgICAgaWYoaW5wdXRzKSB7XG4gICAgICAgICAgaW5wdXRzLmZvckVhY2goZnVuY3Rpb24oaW5wdXRTdHIpIHtcbiAgICAgICAgICAgIHZhciB2YWx1ZU1hdGNoID0gaW5wdXRTdHIubWF0Y2goL25hbWU9XCIoW15cIl0qKVwiXFxzdmFsdWU9XCIoW15cIl0qKS8pO1xuICAgICAgICAgICAgbG9naW5QYXJhbXNbdmFsdWVNYXRjaFsxXV0gPSB2YWx1ZU1hdGNoWzJdO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHN1Y2Nlc3MgPSB0aGlzLnN1Y2Nlc3MsIGVycm9yID0gdGhpcy5lcnJvcjtcbiAgICAgICAgc2VsZi5fYWpheC5wb3N0KHNlbGYubG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uKCkge1xuICAgICAgICAgIC8vd2UgbmVlZCB0aGlzIGdldCByZXF1ZXN0IGJlY2F1c2Ugb2YgdGhlIHNhcyA5LjQgc2VjdXJpdHkgY2hlY2tzXG4gICAgICAgICAgc2VsZi5fYWpheC5nZXQoc2VsZi51cmwpLnN1Y2Nlc3Moc3VjY2VzcykuZXJyb3IoZXJyb3IpO1xuICAgICAgICB9KS5lcnJvcih0aGlzLmVycm9yKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vZ2V0dGluZyBmb3JtIGFnYWluLCBidXQgaXQgd2Fzbid0IGEgcmVkaXJlY3RcbiAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnV3JvbmcgdXNlcm5hbWUgb3IgcGFzc3dvcmQnKTtcbiAgICAgICAgY2FsbGJhY2soLTEpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjYWxsYmFjayhyZXMuc3RhdHVzKTtcblxuICAgICAgc2VsZi5fZGlzYWJsZUNhbGxzID0gZmFsc2U7XG5cbiAgICAgIHdoaWxlKHNlbGYuX3BlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHZhciBwZW5kaW5nQ2FsbCAgICAgPSBzZWxmLl9wZW5kaW5nQ2FsbHMuc2hpZnQoKTtcbiAgICAgICAgdmFyIHNhc1Byb2dyYW0gICAgICA9IHBlbmRpbmdDYWxsLnNhc1Byb2dyYW07XG4gICAgICAgIHZhciBjYWxsYmFja1BlbmRpbmcgPSBwZW5kaW5nQ2FsbC5jYWxsYmFjaztcbiAgICAgICAgdmFyIHBhcmFtcyAgICAgICAgICA9IHBlbmRpbmdDYWxsLnBhcmFtcztcblxuICAgICAgICAvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG4gICAgICAgIHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblxuICAgICAgICBpZihzZWxmLnJldHJ5QWZ0ZXJMb2dpbikge1xuICAgICAgICAgIHNlbGYuY2FsbChzYXNQcm9ncmFtLCBudWxsLCBjYWxsYmFja1BlbmRpbmcsIHBhcmFtcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0pLmVycm9yKGZ1bmN0aW9uKHJlcykge1xuICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG4gICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG4gIH0pO1xufTtcblxuLypcbiogTG9nb3V0IG1ldGhvZFxuKlxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKi9cblxubW9kdWxlLmV4cG9ydHMubG9nb3V0ID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgdGhpcy5fYWpheC5nZXQodGhpcy51cmwsIHtfYWN0aW9uOiAnbG9nb2ZmJ30pLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgY2FsbGJhY2soKTtcbiAgfSkuZXJyb3IoZnVuY3Rpb24ocmVzKSB7XG4gICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9nb3V0IGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG4gICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG4gIH0pO1xufTtcblxuLypcbiogRW50ZXIgZGVidWcgbW9kZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnNldERlYnVnTW9kZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmRlYnVnID0gdHJ1ZTtcbn07XG5cbi8qXG4qIEV4aXQgZGVidWcgbW9kZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnVuc2V0RGVidWdNb2RlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZGVidWcgPSBmYWxzZTtcbn07XG5cbmZvcih2YXIga2V5IGluIGxvZ3MuZ2V0KSB7XG4gIGlmKGxvZ3MuZ2V0Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICBtb2R1bGUuZXhwb3J0c1trZXldID0gbG9ncy5nZXRba2V5XTtcbiAgfVxufVxuXG5mb3IodmFyIGtleSBpbiBsb2dzLmNsZWFyKSB7XG4gIGlmKGxvZ3MuY2xlYXIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgIG1vZHVsZS5leHBvcnRzW2tleV0gPSBsb2dzLmNsZWFyW2tleV07XG4gIH1cbn1cblxuLypcbiogQWRkIGNhbGxiYWNrIGZ1bmN0aW9ucyBleGVjdXRlZCB3aGVuIHByb3BlcnRpZXMgYXJlIHVwZGF0ZWQgd2l0aCByZW1vdGUgY29uZmlnXG4qXG4qQGNhbGxiYWNrIC0gY2FsbGJhY2sgcHVzaGVkIHRvIGFycmF5XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMub25SZW1vdGVDb25maWdVcGRhdGUgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICB0aGlzLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLl91dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcbiIsInZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xudmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5cbnZhciBwcm9ncmFtTm90Rm91bmRQYXR0ID0gLzx0aXRsZT4oU3RvcmVkIFByb2Nlc3MgRXJyb3J8U0FTU3RvcmVkUHJvY2Vzcyk8XFwvdGl0bGU+W1xcc1xcU10qPGgyPihTdG9yZWQgcHJvY2VzcyBub3QgZm91bmQ6Lip8Lipub3QgYSB2YWxpZCBzdG9yZWQgcHJvY2VzcyBwYXRoLik8XFwvaDI+LztcbnZhciByZXNwb25zZVJlcGxhY2UgPSBmdW5jdGlvbihyZXMpIHtcbiAgcmV0dXJuIHJlcy5yZXBsYWNlKC8oXFxyXFxufFxccnxcXG4pL2csICcnKS5yZXBsYWNlKC9cXFxcXFxcXChufHJ8dHxmfGIpL2csICdcXFxcJDEnKS5yZXBsYWNlKC9cXFxcXCJcXFxcXCIvZywgJ1xcXFxcIicpO1xufTtcblxuLypcbiogUGFyc2UgcmVzcG9uc2UgZnJvbSBzZXJ2ZXJcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlUmVzID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgdmFyIG1hdGNoZXMgPSByZXNwb25zZVRleHQubWF0Y2gocHJvZ3JhbU5vdEZvdW5kUGF0dCk7XG4gIGlmKG1hdGNoZXMpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtTm90Rm91bmQnLCAnWW91IGhhdmUgbm90IGJlZW4gZ3JhbnRlZCBwZXJtaXNzaW9uIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24sIG9yIHRoZSBTVFAgaXMgbWlzc2luZy4nKTtcbiAgfVxuICAvL3JlbW92ZSBuZXcgbGluZXMgaW4ganNvbiByZXNwb25zZVxuICAvL3JlcGxhY2UgXFxcXChkKSB3aXRoIFxcKGQpIC0gU0FTIGpzb24gcGFyc2VyIGlzIGVzY2FwaW5nIGl0XG4gIHJldHVybiBKU09OLnBhcnNlKHJlc3BvbnNlUmVwbGFjZShyZXNwb25zZVRleHQpKTtcbn07XG5cbi8qXG4qIFBhcnNlIHJlc3BvbnNlIGZyb20gc2VydmVyIGluIGRlYnVnIG1vZGVcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlRGVidWdSZXMgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcykge1xuICB2YXIgbWF0Y2hlcyA9IHJlc3BvbnNlVGV4dC5tYXRjaChwcm9ncmFtTm90Rm91bmRQYXR0KTtcbiAgaWYobWF0Y2hlcykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1Ob3RGb3VuZCcsICdZb3UgaGF2ZSBub3QgYmVlbiBncmFudGVkIHBlcm1pc3Npb24gdG8gcGVyZm9ybSB0aGlzIGFjdGlvbiwgb3IgdGhlIFNUUCBpcyBtaXNzaW5nLicpO1xuICB9XG5cbiAgLy9maW5kIGpzb25cbiAgcGF0dCAgICAgICAgICAgICAgPSAvXiguPy0taDU0cy1kYXRhLXN0YXJ0LS0pKFtcXFNcXHNdKj8pKC0taDU0cy1kYXRhLWVuZC0tKS9tO1xuICBtYXRjaGVzICAgICAgICAgICA9IHJlc3BvbnNlVGV4dC5tYXRjaChwYXR0KTtcblxuICB2YXIgcGFnZSAgICAgICAgICA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKHBhdHQsICcnKTtcbiAgdmFyIGh0bWxCb2R5UGF0dCAgPSAvPGJvZHkuKj4oW1xcc1xcU10qKTxcXC9ib2R5Pi87XG4gIHZhciBib2R5TWF0Y2hlcyAgID0gcGFnZS5tYXRjaChodG1sQm9keVBhdHQpO1xuXG4gIC8vcmVtb3ZlIGh0bWwgdGFnc1xuICB2YXIgZGVidWdUZXh0ID0gYm9keU1hdGNoZXNbMV0ucmVwbGFjZSgvPFtePl0qPi9nLCAnJyk7XG4gIGRlYnVnVGV4dCAgICAgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhkZWJ1Z1RleHQpO1xuXG4gIGxvZ3MuYWRkRGVidWdEYXRhKGJvZHlNYXRjaGVzWzFdLCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0sIHBhcmFtcyk7XG5cbiAgaWYodGhpcy5wYXJzZUVycm9yUmVzcG9uc2UocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKSkge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3Nhc0Vycm9yJywgJ1NhcyBwcm9ncmFtIGNvbXBsZXRlZCB3aXRoIGVycm9ycycpO1xuICB9XG5cbiAgaWYoIW1hdGNoZXMpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJyk7XG4gIH1cbiAgLy9yZW1vdmUgbmV3IGxpbmVzIGluIGpzb24gcmVzcG9uc2VcbiAgLy9yZXBsYWNlIFxcXFwoZCkgd2l0aCBcXChkKSAtIFNBUyBqc29uIHBhcnNlciBpcyBlc2NhcGluZyBpdFxuICB2YXIganNvbk9iaiA9IEpTT04ucGFyc2UocmVzcG9uc2VSZXBsYWNlKG1hdGNoZXNbMl0pKTtcblxuICByZXR1cm4ganNvbk9iajtcbn07XG5cbi8qXG4qIEFkZCBmYWlsZWQgcmVzcG9uc2UgdG8gbG9ncyAtIHVzZWQgb25seSBpZiBkZWJ1Zz1mYWxzZVxuKlxuKiBAcGFyYW0ge29iamVjdH0gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSBwYXRoXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkRmFpbGVkUmVzcG9uc2UgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pIHtcbiAgdmFyIHBhdHQgICAgICA9IC88c2NyaXB0KFtcXHNcXFNdKilcXC9mb3JtPi87XG4gIHZhciBwYXR0MiAgICAgPSAvZGlzcGxheVxccz86XFxzP25vbmU7P1xccz8vO1xuICAvL3JlbW92ZSBzY3JpcHQgd2l0aCBmb3JtIGZvciB0b2dnbGluZyB0aGUgbG9ncyBhbmQgXCJkaXNwbGF5Om5vbmVcIiBmcm9tIHN0eWxlXG4gIHJlc3BvbnNlVGV4dCAgPSByZXNwb25zZVRleHQucmVwbGFjZShwYXR0LCAnJykucmVwbGFjZShwYXR0MiwgJycpO1xuICB2YXIgZGVidWdUZXh0ID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UoLzxbXj5dKj4vZywgJycpO1xuICBkZWJ1Z1RleHQgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhkZWJ1Z1RleHQpO1xuXG4gIGxvZ3MuYWRkRmFpbGVkUmVxdWVzdChyZXNwb25zZVRleHQsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSk7XG59O1xuXG4vKlxuKiBVbmVzY2FwZSBhbGwgc3RyaW5nIHZhbHVlcyBpbiByZXR1cm5lZCBvYmplY3RcbipcbiogQHBhcmFtIHtvYmplY3R9IG9ialxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnVuZXNjYXBlVmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnc3RyaW5nJykge1xuICAgICAgb2JqW2tleV0gPSBkZWNvZGVVUklDb21wb25lbnQob2JqW2tleV0pO1xuICAgIH0gZWxzZSBpZih0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgICAgdGhpcy51bmVzY2FwZVZhbHVlcyhvYmpba2V5XSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvYmo7XG59O1xuXG4vKlxuKiBQYXJzZSBlcnJvciByZXNwb25zZSBmcm9tIHNlcnZlciBhbmQgc2F2ZSBlcnJvcnMgaW4gbWVtb3J5XG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbiogI3BhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSB3aGljaCByZXR1cm5lZCB0aGUgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZUVycm9yUmVzcG9uc2UgPSBmdW5jdGlvbihyZXMsIHNhc1Byb2dyYW0pIHtcbiAgLy9jYXB0dXJlICdFUlJPUjogW3RleHRdLicgb3IgJ0VSUk9SIHh4IFt0ZXh0XS4nXG4gIHZhciBwYXR0ICAgID0gL0VSUk9SKDpcXHN8XFxzXFxkXFxkKSguKlxcLnwuKlxcbi4qXFwuKS9nbTtcbiAgdmFyIGVycm9ycyAgPSByZXMubWF0Y2gocGF0dCk7XG4gIGlmKCFlcnJvcnMpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgZXJyTWVzc2FnZTtcbiAgZm9yKHZhciBpID0gMCwgbiA9IGVycm9ycy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICBlcnJNZXNzYWdlICA9IGVycm9yc1tpXS5yZXBsYWNlKC88W14+XSo+L2csICcnKS5yZXBsYWNlKC8oXFxufFxcc3syLH0pL2csICcgJyk7XG4gICAgZXJyTWVzc2FnZSAgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhlcnJNZXNzYWdlKTtcbiAgICBlcnJvcnNbaV0gICA9IHtcbiAgICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgICBtZXNzYWdlOiAgICBlcnJNZXNzYWdlLFxuICAgICAgdGltZTogICAgICAgbmV3IERhdGUoKVxuICAgIH07XG4gIH1cblxuICBsb2dzLmFkZFNhc0Vycm9ycyhlcnJvcnMpO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuLypcbiogRGVjb2RlIEhUTUwgZW50aXRpZXNcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmRlY29kZUhUTUxFbnRpdGllcyA9IGZ1bmN0aW9uIChodG1sKSB7XG4gIHZhciB0ZW1wRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgdmFyIHN0ciAgICAgICAgID0gaHRtbC5yZXBsYWNlKC8mKCMoPzp4WzAtOWEtZl0rfFxcZCspfFthLXpdKyk7L2dpLFxuICAgIGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgIHRlbXBFbGVtZW50LmlubmVySFRNTCA9IHN0cjtcbiAgICAgIHN0ciAgICAgICAgICAgICAgICAgICA9IHRlbXBFbGVtZW50LnRleHRDb250ZW50IHx8IHRlbXBFbGVtZW50LmlubmVyVGV4dDtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICApO1xuICByZXR1cm4gc3RyO1xufTtcblxuLypcbiogQ29udmVydCBzYXMgdGltZSB0byBqYXZhc2NyaXB0IGRhdGVcbipcbiogQHBhcmFtIHtudW1iZXJ9IHNhc0RhdGUgLSBzYXMgVGF0ZSBvYmplY3RcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5mcm9tU2FzRGF0ZVRpbWUgPSBmdW5jdGlvbiAoc2FzRGF0ZSkge1xuICB2YXIgYmFzZWRhdGUgPSBuZXcgRGF0ZShcIkphbnVhcnkgMSwgMTk2MCAwMDowMDowMFwiKTtcbiAgdmFyIGN1cnJkYXRlID0gc2FzRGF0ZTtcblxuICAvLyBvZmZzZXRzIGZvciBVVEMgYW5kIHRpbWV6b25lcyBhbmQgQlNUXG4gIHZhciBiYXNlT2Zmc2V0ID0gYmFzZWRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xuXG4gIC8vIGNvbnZlcnQgc2FzIGRhdGV0aW1lIHRvIGEgY3VycmVudCB2YWxpZCBqYXZhc2NyaXB0IGRhdGVcbiAgdmFyIGJhc2VkYXRlTXMgID0gYmFzZWRhdGUuZ2V0VGltZSgpOyAvLyBpbiBtc1xuICB2YXIgY3VycmRhdGVNcyAgPSBjdXJyZGF0ZSAqIDEwMDA7IC8vIHRvIG1zXG4gIHZhciBzYXNEYXRldGltZSA9IGN1cnJkYXRlTXMgKyBiYXNlZGF0ZU1zO1xuICB2YXIganNEYXRlICAgICAgPSBuZXcgRGF0ZSgpO1xuICBqc0RhdGUuc2V0VGltZShzYXNEYXRldGltZSk7IC8vIGZpcnN0IHRpbWUgdG8gZ2V0IG9mZnNldCBCU1QgZGF5bGlnaHQgc2F2aW5ncyBldGNcbiAgdmFyIGN1cnJPZmZzZXQgID0ganNEYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGFkanVzdCBmb3Igb2Zmc2V0IGluIG1pbnV0ZXNcbiAgdmFyIG9mZnNldFZhciAgID0gKGJhc2VPZmZzZXQgLSBjdXJyT2Zmc2V0KSAqIDYwICogMTAwMDsgLy8gZGlmZmVyZW5jZSBpbiBtaWxsaXNlY29uZHNcbiAgdmFyIG9mZnNldFRpbWUgID0gc2FzRGF0ZXRpbWUgLSBvZmZzZXRWYXI7IC8vIGZpbmRpbmcgQlNUIGFuZCBkYXlsaWdodCBzYXZpbmdzXG4gIGpzRGF0ZS5zZXRUaW1lKG9mZnNldFRpbWUpOyAvLyB1cGRhdGUgd2l0aCBvZmZzZXRcbiAgcmV0dXJuIGpzRGF0ZTtcbn07XG5cbi8qXG4qIENvbnZlcnQgc2FzIHRpbWVzdGFtcHMgdG8gamF2YXNjcmlwdCBEYXRlIG9iamVjdFxuKlxuKiBAcGFyYW0ge29iamVjdH0gb2JqXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuY29udmVydERhdGVzID0gZnVuY3Rpb24ob2JqKSB7XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnbnVtYmVyJyAmJiAoa2V5LmluZGV4T2YoJ2R0XycpID09PSAwIHx8IGtleS5pbmRleE9mKCdEVF8nKSA9PT0gMCkpIHtcbiAgICAgIG9ialtrZXldID0gdGhpcy5mcm9tU2FzRGF0ZVRpbWUob2JqW2tleV0pO1xuICAgIH0gZWxzZSBpZih0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgICAgdGhpcy5jb252ZXJ0RGF0ZXMob2JqW2tleV0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gb2JqO1xufTtcblxubW9kdWxlLmV4cG9ydHMubmVlZFRvTG9naW4gPSBmdW5jdGlvbihyZXNwb25zZU9iaikge1xuICB2YXIgcGF0dCA9IC88Zm9ybS4rYWN0aW9uPVwiKC4qTG9nb25bXlwiXSopLio+LztcbiAgdmFyIG1hdGNoZXMgPSBwYXR0LmV4ZWMocmVzcG9uc2VPYmoucmVzcG9uc2VUZXh0KTtcbiAgdmFyIG5ld0xvZ2luVXJsO1xuXG4gIGlmKCFtYXRjaGVzKSB7XG4gICAgLy90aGVyZSdzIG5vIGZvcm0sIHdlIGFyZSBpbi4gaG9vcmF5IVxuICAgIHJldHVybiBmYWxzZTtcbiAgfSBlbHNlIHtcbiAgICB2YXIgYWN0aW9uVXJsID0gbWF0Y2hlc1sxXS5yZXBsYWNlKC9cXD8uKi8sICcnKTtcbiAgICBpZihhY3Rpb25VcmwuY2hhckF0KDApID09PSAnLycpIHtcbiAgICAgIG5ld0xvZ2luVXJsID0gdGhpcy5ob3N0VXJsID8gdGhpcy5ob3N0VXJsICsgYWN0aW9uVXJsIDogYWN0aW9uVXJsO1xuICAgICAgaWYobmV3TG9naW5VcmwgIT09IHRoaXMubG9naW5VcmwpIHtcbiAgICAgICAgdGhpcy5fbG9naW5DaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5sb2dpblVybCA9IG5ld0xvZ2luVXJsO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvL3JlbGF0aXZlIHBhdGhcblxuICAgICAgdmFyIGxhc3RJbmRPZlNsYXNoID0gcmVzcG9uc2VPYmoucmVzcG9uc2VVUkwubGFzdEluZGV4T2YoJy8nKSArIDE7XG4gICAgICAvL3JlbW92ZSBldmVyeXRoaW5nIGFmdGVyIHRoZSBsYXN0IHNsYXNoLCBhbmQgZXZlcnl0aGluZyB1bnRpbCB0aGUgZmlyc3RcbiAgICAgIHZhciByZWxhdGl2ZUxvZ2luVXJsID0gcmVzcG9uc2VPYmoucmVzcG9uc2VVUkwuc3Vic3RyKDAsIGxhc3RJbmRPZlNsYXNoKS5yZXBsYWNlKC8uKlxcL3syfVteXFwvXSovLCAnJykgKyBhY3Rpb25Vcmw7XG4gICAgICBuZXdMb2dpblVybCA9IHRoaXMuaG9zdFVybCA/IHRoaXMuaG9zdFVybCArIHJlbGF0aXZlTG9naW5VcmwgOiByZWxhdGl2ZUxvZ2luVXJsO1xuICAgICAgaWYobmV3TG9naW5VcmwgIT09IHRoaXMubG9naW5VcmwpIHtcbiAgICAgICAgdGhpcy5fbG9naW5DaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5sb2dpblVybCA9IG5ld0xvZ2luVXJsO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vc2F2ZSBwYXJhbWV0ZXJzIGZyb20gaGlkZGVuIGZvcm0gZmllbGRzXG4gICAgdmFyIGlucHV0cyA9IHJlc3BvbnNlT2JqLnJlc3BvbnNlVGV4dC5tYXRjaCgvPGlucHV0LipcImhpZGRlblwiW14+XSo+L2cpO1xuICAgIHZhciBoaWRkZW5Gb3JtUGFyYW1zID0ge307XG4gICAgaWYoaW5wdXRzKSB7XG4gICAgICAvL2l0J3MgbmV3IGxvZ2luIHBhZ2UgaWYgd2UgaGF2ZSB0aGVzZSBhZGRpdGlvbmFsIHBhcmFtZXRlcnNcbiAgICAgIHRoaXMuX2lzTmV3TG9naW5QYWdlID0gdHJ1ZTtcbiAgICAgIGlucHV0cy5mb3JFYWNoKGZ1bmN0aW9uKGlucHV0U3RyKSB7XG4gICAgICAgIHZhciB2YWx1ZU1hdGNoID0gaW5wdXRTdHIubWF0Y2goL25hbWU9XCIoW15cIl0qKVwiXFxzdmFsdWU9XCIoW15cIl0qKS8pO1xuICAgICAgICBoaWRkZW5Gb3JtUGFyYW1zW3ZhbHVlTWF0Y2hbMV1dID0gdmFsdWVNYXRjaFsyXTtcbiAgICAgIH0pO1xuICAgICAgdGhpcy5fYWRpdGlvbmFsTG9naW5QYXJhbXMgPSBoaWRkZW5Gb3JtUGFyYW1zO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG59O1xuXG4vKlxuKiBHZXQgZnVsbCBwcm9ncmFtIHBhdGggZnJvbSBtZXRhZGF0YSByb290IGFuZCByZWxhdGl2ZSBwYXRoXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSBtZXRhZGF0YVJvb3QgLSBNZXRhZGF0YSByb290IChwYXRoIHdoZXJlIGFsbCBwcm9ncmFtcyBmb3IgdGhlIHByb2plY3QgYXJlIGxvY2F0ZWQpXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtUGF0aCAtIFNhcyBwcm9ncmFtIHBhdGhcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5nZXRGdWxsUHJvZ3JhbVBhdGggPSBmdW5jdGlvbihtZXRhZGF0YVJvb3QsIHNhc1Byb2dyYW1QYXRoKSB7XG4gIHJldHVybiBtZXRhZGF0YVJvb3QgPyBtZXRhZGF0YVJvb3QucmVwbGFjZSgvXFwvPyQvLCAnLycpICsgc2FzUHJvZ3JhbVBhdGgucmVwbGFjZSgvXlxcLy8sICcnKSA6IHNhc1Byb2dyYW1QYXRoO1xufTtcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuL2Vycm9yLmpzJyk7XG52YXIgbG9ncyAgICAgID0gcmVxdWlyZSgnLi9sb2dzLmpzJyk7XG52YXIgVGFibGVzICAgID0gcmVxdWlyZSgnLi90YWJsZXMnKTtcbnZhciBGaWxlcyAgICAgPSByZXF1aXJlKCcuL2ZpbGVzJyk7XG52YXIgdG9TYXNEYXRlVGltZSA9IHJlcXVpcmUoJy4vdGFibGVzL3V0aWxzLmpzJykudG9TYXNEYXRlVGltZTtcblxuLypcbiogaDU0cyBTQVMgZGF0YSBvYmplY3QgY29uc3RydWN0b3JcbiogQGNvbnN0cnVjdG9yXG4qXG4qQHBhcmFtIHthcnJheXxmaWxlfSBkYXRhIC0gVGFibGUgb3IgZmlsZSBhZGRlZCB3aGVuIG9iamVjdCBpcyBjcmVhdGVkXG4qQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIG1hY3JvIG5hbWVcbipAcGFyYW0ge251bWJlcn0gcGFyYW1ldGVyVGhyZXNob2xkIC0gc2l6ZSBvZiBkYXRhIG9iamVjdHMgc2VudCB0byBTQVNcbipcbiovXG5mdW5jdGlvbiBTYXNEYXRhKGRhdGEsIG1hY3JvTmFtZSwgc3BlY3MpIHtcbiAgaWYoZGF0YSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgdGhpcy5fZmlsZXMgPSB7fTtcbiAgICB0aGlzLmFkZFRhYmxlKGRhdGEsIG1hY3JvTmFtZSwgc3BlY3MpO1xuICB9IGVsc2UgaWYoZGF0YSBpbnN0YW5jZW9mIEZpbGUpIHtcbiAgICBGaWxlcy5jYWxsKHRoaXMsIGRhdGEsIG1hY3JvTmFtZSk7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdEYXRhIGFyZ3VtZW50IHdyb25nIHR5cGUgb3IgbWlzc2luZycpO1xuICB9XG59XG5cbi8qXG4qIEFkZCB0YWJsZSB0byB0YWJsZXMgb2JqZWN0XG4qIEBwYXJhbSB7YXJyYXl9IHRhYmxlIC0gQXJyYXkgb2YgdGFibGUgb2JqZWN0c1xuKiBAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gU2FzIG1hY3JvIG5hbWVcbipcbiovXG5TYXNEYXRhLnByb3RvdHlwZS5hZGRUYWJsZSA9IGZ1bmN0aW9uKHRhYmxlLCBtYWNyb05hbWUsIHNwZWNzKSB7XG4gIHZhciBpc1NwZWNzUHJvdmlkZWQgPSAhIXNwZWNzO1xuICBpZih0YWJsZSAmJiBtYWNyb05hbWUpIHtcbiAgICBpZighKHRhYmxlIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgYXJyYXknKTtcbiAgICB9XG4gICAgaWYodHlwZW9mIG1hY3JvTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XG4gICAgfVxuICAgIGlmKCFpc05hTihtYWNyb05hbWVbbWFjcm9OYW1lLmxlbmd0aCAtIDFdKSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNYWNybyBuYW1lIGNhbm5vdCBoYXZlIG51bWJlciBhdCB0aGUgZW5kJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBhcmd1bWVudHMnKTtcbiAgfVxuXG4gIGlmICh0eXBlb2YgdGFibGUgIT09ICdvYmplY3QnIHx8ICEodGFibGUgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIGFyZ3VtZW50IGlzIG5vdCBhbiBhcnJheScpO1xuICB9XG5cbiAgdmFyIGtleTtcbiAgaWYoc3BlY3MpIHtcbiAgICBpZihzcGVjcy5jb25zdHJ1Y3RvciAhPT0gT2JqZWN0KSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1NwZWNzIGRhdGEgdHlwZSB3cm9uZy4gT2JqZWN0IGV4cGVjdGVkLicpO1xuICAgIH1cbiAgICBmb3Ioa2V5IGluIHRhYmxlWzBdKSB7XG4gICAgICBpZighc3BlY3Nba2V5XSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgY29sdW1ucyBpbiBzcGVjcyBkYXRhLicpO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3Ioa2V5IGluIHNwZWNzKSB7XG4gICAgICBpZihzcGVjc1trZXldLmNvbnN0cnVjdG9yICE9PSBPYmplY3QpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdXcm9uZyBjb2x1bW4gZGVzY3JpcHRvciBpbiBzcGVjcyBkYXRhLicpO1xuICAgICAgfVxuICAgICAgaWYoIXNwZWNzW2tleV0uY29sVHlwZSB8fCAhc3BlY3Nba2V5XS5jb2xMZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGNvbHVtbnMgaW4gc3BlY3MgZGVzY3JpcHRvci4nKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB2YXIgaSwgaiwgLy9jb3VudGVycyB1c2VkIGxhdHRlciBpbiBjb2RlXG4gICAgICByb3csIHZhbCwgdHlwZSxcbiAgICAgIHNwZWNLZXlzID0gW10sXG4gICAgICBzcGVjaWFsQ2hhcnMgPSBbJ1wiJywgJ1xcXFwnLCAnLycsICdcXG4nLCAnXFx0JywgJ1xcZicsICdcXHInLCAnXFxiJ107XG5cbiAgaWYoIXNwZWNzKSB7XG4gICAgc3BlY3MgPSB7fTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCB0YWJsZS5sZW5ndGg7IGkrKykge1xuICAgICAgcm93ID0gdGFibGVbaV07XG5cbiAgICAgIGlmKHR5cGVvZiByb3cgIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgaXRlbSBpcyBub3QgYW4gb2JqZWN0Jyk7XG4gICAgICB9XG5cbiAgICAgIGZvcihrZXkgaW4gcm93KSB7XG4gICAgICAgIGlmKHJvdy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgdmFsICA9IHJvd1trZXldO1xuICAgICAgICAgIHR5cGUgPSB0eXBlb2YgdmFsO1xuXG4gICAgICAgICAgaWYoc3BlY3Nba2V5XSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBzcGVjS2V5cy5wdXNoKGtleSk7XG4gICAgICAgICAgICBzcGVjc1trZXldID0ge307XG5cbiAgICAgICAgICAgIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICBpZih2YWwgPCBOdW1iZXIuTUlOX1NBRkVfSU5URUdFUiB8fCB2YWwgPiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikge1xuICAgICAgICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ09iamVjdFsnICsgaSArICddLicgKyBrZXkgKyAnIC0gVGhpcyB2YWx1ZSBleGNlZWRzIGV4cGVjdGVkIG51bWVyaWMgcHJlY2lzaW9uLicpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sVHlwZSAgID0gJ251bSc7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gODtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycgJiYgISh2YWwgaW5zdGFuY2VvZiBEYXRlKSkgeyAvLyBzdHJhaWdodGZvcndhcmQgc3RyaW5nXG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sVHlwZSAgICA9ICdzdHJpbmcnO1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCAgPSB2YWwubGVuZ3RoO1xuICAgICAgICAgICAgfSBlbHNlIGlmKHZhbCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgPSAnZGF0ZSc7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gODtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgPSAnanNvbic7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gSlNPTi5zdHJpbmdpZnkodmFsKS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHNwZWNLZXlzID0gT2JqZWN0LmtleXMoc3BlY3MpO1xuICB9XG5cbiAgdmFyIHNhc0NzdiA9ICcnO1xuXG4gIC8vIHdlIG5lZWQgdHdvIGxvb3BzIC0gdGhlIGZpcnN0IG9uZSBpcyBjcmVhdGluZyBzcGVjcyBhbmQgdmFsaWRhdGluZ1xuICBmb3IgKGkgPSAwOyBpIDwgdGFibGUubGVuZ3RoOyBpKyspIHtcbiAgICByb3cgPSB0YWJsZVtpXTtcbiAgICBmb3IoaiA9IDA7IGogPCBzcGVjS2V5cy5sZW5ndGg7IGorKykge1xuICAgICAga2V5ID0gc3BlY0tleXNbal07XG4gICAgICBpZihyb3cuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICB2YWwgID0gcm93W2tleV07XG4gICAgICAgIHR5cGUgPSB0eXBlb2YgdmFsO1xuXG4gICAgICAgIGlmKHR5cGUgPT09ICdudW1iZXInICYmIGlzTmFOKHZhbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnTmFOIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmKHZhbCA9PT0gLUluZmluaXR5IHx8IHZhbCA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCB2YWwudG9TdHJpbmcoKSArICcgdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYodmFsID09PSB0cnVlIHx8IHZhbCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnQm9vbGVhbiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBpZih0eXBlID09PSAnc3RyaW5nJyAmJiB2YWwuaW5kZXhPZignXFxuJykgIT09IC0xKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ05ldyBsaW5lIGNoYXJhY3RlciBpcyBub3Qgc3VwcG9ydGVkJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjb252ZXJ0IG51bGwgdG8gJy4nIGZvciBudW1iZXJzIGFuZCB0byAnJyBmb3Igc3RyaW5nc1xuICAgICAgICBpZih2YWwgPT09IG51bGwpIHtcbiAgICAgICAgICBpZihzcGVjc1trZXldLmNvbFR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB2YWwgPSAnJztcbiAgICAgICAgICAgIHR5cGUgPSAnc3RyaW5nJztcbiAgICAgICAgICB9IGVsc2UgaWYoc3BlY3Nba2V5XS5jb2xUeXBlID09PSAnbnVtJykge1xuICAgICAgICAgICAgdmFsID0gJy4nO1xuICAgICAgICAgICAgdHlwZSA9ICdudW1iZXInO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnQ2Fubm90IGNvbnZlcnQgbnVsbCB2YWx1ZScpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgaWYgKCh0eXBlID09PSAnbnVtYmVyJyAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdudW0nICYmIHZhbCAhPT0gJy4nKSB8fFxuICAgICAgICAgICh0eXBlID09PSAnc3RyaW5nJyAmJiAhKHZhbCBpbnN0YW5jZW9mIERhdGUpICYmIHNwZWNzW2tleV0uY29sVHlwZSAhPT0gJ3N0cmluZycpIHx8XG4gICAgICAgICAgKHZhbCBpbnN0YW5jZW9mIERhdGUgJiYgc3BlY3Nba2V5XS5jb2xUeXBlICE9PSAnZGF0ZScpIHx8XG4gICAgICAgICAgKCh0eXBlID09PSAnb2JqZWN0JyAmJiB2YWwuY29uc3RydWN0b3IgIT09IERhdGUpICYmIHNwZWNzW2tleV0uY29sVHlwZSAhPT0gJ2pzb24nKSlcbiAgICAgICAge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdUaGVyZSBpcyBhIHNwZWNzIG1pc21hdGNoIGluIHRoZSBhcnJheSBiZXR3ZWVuIHZhbHVlcyAoY29sdW1ucykgb2YgdGhlIHNhbWUgbmFtZS4nKTtcbiAgICAgICAgfSBlbHNlIGlmKCFpc1NwZWNzUHJvdmlkZWQgJiYgdHlwZSA9PT0gJ3N0cmluZycgJiYgc3BlY3Nba2V5XS5jb2xMZW5ndGggPCB2YWwubGVuZ3RoKSB7XG4gICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSB2YWwubGVuZ3RoO1xuICAgICAgICB9IGVsc2UgaWYoKHR5cGUgPT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sTGVuZ3RoIDwgdmFsLmxlbmd0aCkgfHwgKHR5cGUgIT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sTGVuZ3RoICE9PSA4KSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdUaGVyZSBpcyBhIHNwZWNzIG1pc21hdGNoIGluIHRoZSBhcnJheSBiZXR3ZWVuIHZhbHVlcyAoY29sdW1ucykgb2YgdGhlIHNhbWUgbmFtZS4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgICAgdmFsID0gdG9TYXNEYXRlVGltZSh2YWwpO1xuICAgICAgICB9XG5cbiAgICAgICAgc3dpdGNoKHNwZWNzW2tleV0uY29sVHlwZSkge1xuICAgICAgICAgIGNhc2UgJ251bSc6XG4gICAgICAgICAgY2FzZSAnZGF0ZSc6XG4gICAgICAgICAgICBzYXNDc3YgKz0gdmFsO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgIHNhc0NzdiArPSAnXCInICsgdmFsLnJlcGxhY2UoL1wiL2csICdcIlwiJykgKyAnXCInO1xuICAgICAgICAgICAgdmFyIGNvbExlbmd0aCA9IHZhbC5sZW5ndGg7XG4gICAgICAgICAgICBmb3IodmFyIGsgPSAwOyBrIDwgdmFsLmxlbmd0aDsgaysrKSB7XG4gICAgICAgICAgICAgIGlmKHNwZWNpYWxDaGFycy5pbmRleE9mKHZhbFtrXSkgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgY29sTGVuZ3RoKys7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvZGUgPSB2YWwuY2hhckNvZGVBdChrKTtcbiAgICAgICAgICAgICAgICBpZihjb2RlID4gMHhmZmZmKSB7XG4gICAgICAgICAgICAgICAgICBjb2xMZW5ndGggKz0gMztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYoY29kZSA+IDB4N2ZmKSB7XG4gICAgICAgICAgICAgICAgICBjb2xMZW5ndGggKz0gMjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYoY29kZSA+IDB4N2YpIHtcbiAgICAgICAgICAgICAgICAgIGNvbExlbmd0aCArPSAxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSBNYXRoLm1heChzcGVjc1trZXldLmNvbExlbmd0aCwgY29sTGVuZ3RoKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICBzYXNDc3YgKz0gJ1wiJyArIEpTT04uc3RyaW5naWR5KHZhbCkucmVwbGFjZSgvXCIvZywgJ1wiXCInKSArICdcIic7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gZG8gbm90IGluc2VydCBpZiBpdCdzIHRoZSBsYXN0IGNvbHVtblxuICAgICAgaWYoaiA8IHNwZWNLZXlzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgc2FzQ3N2ICs9ICcsJztcbiAgICAgIH1cbiAgICB9XG4gICAgaWYoaSA8IHRhYmxlLmxlbmd0aCAtIDEpIHtcbiAgICAgIHNhc0NzdiArPSAnXFxuJztcbiAgICB9XG4gIH1cblxuICAvL2NvbnZlcnQgc3BlY3MgdG8gY3N2IHdpdGggcGlwZXNcbiAgdmFyIHNwZWNTdHJpbmcgPSBzcGVjS2V5cy5tYXAoZnVuY3Rpb24oa2V5KSB7XG4gICAgcmV0dXJuIGtleSArICcsJyArIHNwZWNzW2tleV0uY29sVHlwZSArICcsJyArIHNwZWNzW2tleV0uY29sTGVuZ3RoO1xuICB9KS5qb2luKCd8Jyk7XG5cbiAgdGhpcy5fZmlsZXNbbWFjcm9OYW1lXSA9IFtcbiAgICBzcGVjU3RyaW5nLFxuICAgIG5ldyBGaWxlKFtzYXNDc3ZdLCAndGFibGUuY3N2Jywge3R5cGU6ICd0ZXh0L2NzdjtjaGFyc2V0PVVURi04J30pXG4gIF07XG59O1xuXG5TYXNEYXRhLnByb3RvdHlwZS5hZGRGaWxlICA9IGZ1bmN0aW9uKGZpbGUsIG1hY3JvTmFtZSkge1xuICBGaWxlcy5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgZmlsZSwgbWFjcm9OYW1lKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU2FzRGF0YTtcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG4vKlxuKiBoNTRzIHRhYmxlcyBvYmplY3QgY29uc3RydWN0b3JcbiogQGNvbnN0cnVjdG9yXG4qXG4qQHBhcmFtIHthcnJheX0gdGFibGUgLSBUYWJsZSBhZGRlZCB3aGVuIG9iamVjdCBpcyBjcmVhdGVkXG4qQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIG1hY3JvIG5hbWVcbipAcGFyYW0ge251bWJlcn0gcGFyYW1ldGVyVGhyZXNob2xkIC0gc2l6ZSBvZiBkYXRhIG9iamVjdHMgc2VudCB0byBTQVNcbipcbiovXG5mdW5jdGlvbiBUYWJsZXModGFibGUsIG1hY3JvTmFtZSwgcGFyYW1ldGVyVGhyZXNob2xkKSB7XG4gIHRoaXMuX3RhYmxlcyA9IHt9O1xuICB0aGlzLl9wYXJhbWV0ZXJUaHJlc2hvbGQgPSBwYXJhbWV0ZXJUaHJlc2hvbGQgfHwgMzAwMDA7XG5cbiAgVGFibGVzLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCB0YWJsZSwgbWFjcm9OYW1lKTtcbn1cblxuLypcbiogQWRkIHRhYmxlIHRvIHRhYmxlcyBvYmplY3RcbiogQHBhcmFtIHthcnJheX0gdGFibGUgLSBBcnJheSBvZiB0YWJsZSBvYmplY3RzXG4qIEBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBTYXMgbWFjcm8gbmFtZVxuKlxuKi9cblRhYmxlcy5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24odGFibGUsIG1hY3JvTmFtZSkge1xuICBpZih0YWJsZSAmJiBtYWNyb05hbWUpIHtcbiAgICBpZighKHRhYmxlIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgYXJyYXknKTtcbiAgICB9XG4gICAgaWYodHlwZW9mIG1hY3JvTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XG4gICAgfVxuICAgIGlmKCFpc05hTihtYWNyb05hbWVbbWFjcm9OYW1lLmxlbmd0aCAtIDFdKSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNYWNybyBuYW1lIGNhbm5vdCBoYXZlIG51bWJlciBhdCB0aGUgZW5kJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBhcmd1bWVudHMnKTtcbiAgfVxuXG4gIHZhciByZXN1bHQgPSB0aGlzLl91dGlscy5jb252ZXJ0VGFibGVPYmplY3QodGFibGUsIHRoaXMuX3BhcmFtZXRlclRocmVzaG9sZCk7XG5cbiAgdmFyIHRhYmxlQXJyYXkgPSBbXTtcbiAgdGFibGVBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KHJlc3VsdC5zcGVjKSk7XG4gIGZvciAodmFyIG51bWJlck9mVGFibGVzID0gMDsgbnVtYmVyT2ZUYWJsZXMgPCByZXN1bHQuZGF0YS5sZW5ndGg7IG51bWJlck9mVGFibGVzKyspIHtcbiAgICB2YXIgb3V0U3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocmVzdWx0LmRhdGFbbnVtYmVyT2ZUYWJsZXNdKTtcbiAgICB0YWJsZUFycmF5LnB1c2gob3V0U3RyaW5nKTtcbiAgfVxuICB0aGlzLl90YWJsZXNbbWFjcm9OYW1lXSA9IHRhYmxlQXJyYXk7XG59O1xuXG5UYWJsZXMucHJvdG90eXBlLl91dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBUYWJsZXM7XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcbnZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xuXG4vKlxuKiBDb252ZXJ0IHRhYmxlIG9iamVjdCB0byBTYXMgcmVhZGFibGUgb2JqZWN0XG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBpbk9iamVjdCAtIE9iamVjdCB0byBjb252ZXJ0XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuY29udmVydFRhYmxlT2JqZWN0ID0gZnVuY3Rpb24oaW5PYmplY3QsIGNodW5rVGhyZXNob2xkKSB7XG4gIHZhciBzZWxmICAgICAgICAgICAgPSB0aGlzO1xuXG4gIGlmKGNodW5rVGhyZXNob2xkID4gMzAwMDApIHtcbiAgICBjb25zb2xlLndhcm4oJ1lvdSBzaG91bGQgbm90IHNldCB0aHJlc2hvbGQgbGFyZ2VyIHRoYW4gMzBrYiBiZWNhdXNlIG9mIHRoZSBTQVMgbGltaXRhdGlvbnMnKTtcbiAgfVxuXG4gIC8vIGZpcnN0IGNoZWNrIHRoYXQgdGhlIG9iamVjdCBpcyBhbiBhcnJheVxuICBpZiAodHlwZW9mIChpbk9iamVjdCkgIT09ICdvYmplY3QnKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUaGUgcGFyYW1ldGVyIHBhc3NlZCB0byBjaGVja0FuZEdldFR5cGVPYmplY3QgaXMgbm90IGFuIG9iamVjdCcpO1xuICB9XG5cbiAgdmFyIGFycmF5TGVuZ3RoID0gaW5PYmplY3QubGVuZ3RoO1xuICBpZiAodHlwZW9mIChhcnJheUxlbmd0aCkgIT09ICdudW1iZXInKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUaGUgcGFyYW1ldGVyIHBhc3NlZCB0byBjaGVja0FuZEdldFR5cGVPYmplY3QgZG9lcyBub3QgaGF2ZSBhIHZhbGlkIGxlbmd0aCBhbmQgaXMgbW9zdCBsaWtlbHkgbm90IGFuIGFycmF5Jyk7XG4gIH1cblxuICB2YXIgZXhpc3RpbmdDb2xzID0ge307IC8vIHRoaXMgaXMganVzdCB0byBtYWtlIGxvb2t1cCBlYXNpZXIgcmF0aGVyIHRoYW4gdHJhdmVyc2luZyBhcnJheSBlYWNoIHRpbWUuIFdpbGwgdHJhbnNmb3JtIGFmdGVyXG5cbiAgLy8gZnVuY3Rpb24gY2hlY2tBbmRTZXRBcnJheSAtIHRoaXMgd2lsbCBjaGVjayBhbiBpbk9iamVjdCBjdXJyZW50IGtleSBhZ2FpbnN0IHRoZSBleGlzdGluZyB0eXBlQXJyYXkgYW5kIGVpdGhlciByZXR1cm4gLTEgaWYgdGhlcmVcbiAgLy8gaXMgYSB0eXBlIG1pc21hdGNoIG9yIGFkZCBhbiBlbGVtZW50IGFuZCB1cGRhdGUvaW5jcmVtZW50IHRoZSBsZW5ndGggaWYgbmVlZGVkXG5cbiAgZnVuY3Rpb24gY2hlY2tBbmRJbmNyZW1lbnQoY29sU3BlYykge1xuICAgIGlmICh0eXBlb2YgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdICAgICAgICAgICA9IHt9O1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTmFtZSAgID0gY29sU3BlYy5jb2xOYW1lO1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sVHlwZSAgID0gY29sU3BlYy5jb2xUeXBlO1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoID0gY29sU3BlYy5jb2xMZW5ndGggPiAwID8gY29sU3BlYy5jb2xMZW5ndGggOiAxO1xuICAgICAgcmV0dXJuIDA7IC8vIGFsbCBva1xuICAgIH1cbiAgICAvLyBjaGVjayB0eXBlIG1hdGNoXG4gICAgaWYgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbFR5cGUgIT09IGNvbFNwZWMuY29sVHlwZSkge1xuICAgICAgcmV0dXJuIC0xOyAvLyB0aGVyZSBpcyBhIGZ1ZGdlIGluIHRoZSB0eXBpbmdcbiAgICB9XG4gICAgaWYgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbExlbmd0aCA8IGNvbFNwZWMuY29sTGVuZ3RoKSB7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xMZW5ndGggPSBjb2xTcGVjLmNvbExlbmd0aCA+IDAgPyBjb2xTcGVjLmNvbExlbmd0aCA6IDE7IC8vIGluY3JlbWVudCB0aGUgbWF4IGxlbmd0aCBvZiB0aGlzIGNvbHVtblxuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICB9XG4gIHZhciBjaHVua0FycmF5Q291bnQgICAgICAgICA9IDA7IC8vIHRoaXMgaXMgZm9yIGtlZXBpbmcgdGFicyBvbiBob3cgbG9uZyB0aGUgY3VycmVudCBhcnJheSBzdHJpbmcgd291bGQgYmVcbiAgdmFyIHRhcmdldEFycmF5ICAgICAgICAgICAgID0gW107IC8vIHRoaXMgaXMgdGhlIGFycmF5IG9mIHRhcmdldCBhcnJheXNcbiAgdmFyIGN1cnJlbnRUYXJnZXQgICAgICAgICAgID0gMDtcbiAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0gID0gW107XG4gIHZhciBqICAgICAgICAgICAgICAgICAgICAgICA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaW5PYmplY3QubGVuZ3RoOyBpKyspIHtcbiAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXSA9IHt9O1xuICAgIHZhciBjaHVua1Jvd0NvdW50ICAgICAgICAgICAgID0gMDtcblxuICAgIGZvciAodmFyIGtleSBpbiBpbk9iamVjdFtpXSkge1xuICAgICAgdmFyIHRoaXNTcGVjICA9IHt9O1xuICAgICAgdmFyIHRoaXNWYWx1ZSA9IGluT2JqZWN0W2ldW2tleV07XG5cbiAgICAgIC8vc2tpcCB1bmRlZmluZWQgdmFsdWVzXG4gICAgICBpZih0aGlzVmFsdWUgPT09IHVuZGVmaW5lZCB8fCB0aGlzVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vdGhyb3cgYW4gZXJyb3IgaWYgdGhlcmUncyBOYU4gdmFsdWVcbiAgICAgIGlmKHR5cGVvZiB0aGlzVmFsdWUgPT09ICdudW1iZXInICYmIGlzTmFOKHRoaXNWYWx1ZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ05hTiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgIH1cblxuICAgICAgaWYodGhpc1ZhbHVlID09PSAtSW5maW5pdHkgfHwgdGhpc1ZhbHVlID09PSBJbmZpbml0eSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCB0aGlzVmFsdWUudG9TdHJpbmcoKSArICcgdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICB9XG5cbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gdHJ1ZSB8fCB0aGlzVmFsdWUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdCb29sZWFuIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgfVxuXG4gICAgICAvLyBnZXQgdHlwZS4uLiBpZiBpdCBpcyBhbiBvYmplY3QgdGhlbiBjb252ZXJ0IGl0IHRvIGpzb24gYW5kIHN0b3JlIGFzIGEgc3RyaW5nXG4gICAgICB2YXIgdGhpc1R5cGUgID0gdHlwZW9mICh0aGlzVmFsdWUpO1xuICAgICAgdmFyIGlzRGF0ZSA9IHRoaXNWYWx1ZSBpbnN0YW5jZW9mIERhdGU7XG4gICAgICBpZiAodGhpc1R5cGUgPT09ICdudW1iZXInKSB7IC8vIHN0cmFpZ2h0Zm9yd2FyZCBudW1iZXJcbiAgICAgICAgaWYodGhpc1ZhbHVlIDwgTnVtYmVyLk1JTl9TQUZFX0lOVEVHRVIgfHwgdGhpc1ZhbHVlID4gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHtcbiAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdPYmplY3RbJyArIGkgKyAnXS4nICsga2V5ICsgJyAtIFRoaXMgdmFsdWUgZXhjZWVkcyBleHBlY3RlZCBudW1lcmljIHByZWNpc2lvbi4nKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgICAgICAgICAgICAgICAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICAgICAgICAgICAgICAgICAgPSAnbnVtJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICAgICAgICAgICAgICAgICAgPSA4O1xuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoICAgICAgICAgICAgICA9IHRoaXNWYWx1ZS50b1N0cmluZygpLmxlbmd0aDtcbiAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSAgPSB0aGlzVmFsdWU7XG4gICAgICB9IGVsc2UgaWYgKHRoaXNUeXBlID09PSAnc3RyaW5nJyAmJiAhaXNEYXRlKSB7IC8vIHN0cmFpZ2h0Zm9yd2FyZCBzdHJpbmdcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICA9ICdzdHJpbmcnO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggID0gdGhpc1ZhbHVlLmxlbmd0aDtcblxuICAgICAgICBpZiAodGhpc1ZhbHVlID09PSBcIlwiKSB7XG4gICAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSA9IFwiIFwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gPSBlbmNvZGVVUklDb21wb25lbnQodGhpc1ZhbHVlKS5yZXBsYWNlKC8nL2csICclMjcnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYoaXNEYXRlKSB7XG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgICAgICAgICAgICAgICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgICAgICAgICAgICAgICAgICA9ICdkYXRlJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICAgICAgICAgICAgICAgICAgPSA4O1xuICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldICA9IHNlbGYudG9TYXNEYXRlVGltZSh0aGlzVmFsdWUpO1xuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoICAgICAgICAgICAgICA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0udG9TdHJpbmcoKS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKHRoaXNUeXBlID09ICdvYmplY3QnKSB7XG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgICAgICAgICAgICAgICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgICAgICAgICAgICAgICAgICA9ICdqc29uJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICAgICAgICAgICAgICAgICAgPSBKU09OLnN0cmluZ2lmeSh0aGlzVmFsdWUpLmxlbmd0aDtcbiAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSAgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkodGhpc1ZhbHVlKSkucmVwbGFjZSgvJy9nLCAnJTI3Jyk7XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggICAgICAgICAgICAgID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XS5sZW5ndGg7XG4gICAgICB9XG5cbiAgICAgIGNodW5rUm93Q291bnQgPSBjaHVua1Jvd0NvdW50ICsgNiArIGtleS5sZW5ndGggKyB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoO1xuXG4gICAgICBpZiAoY2hlY2tBbmRJbmNyZW1lbnQodGhpc1NwZWMpID09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdUaGVyZSBpcyBhIHR5cGUgbWlzbWF0Y2ggaW4gdGhlIGFycmF5IGJldHdlZW4gdmFsdWVzIChjb2x1bW5zKSBvZiB0aGUgc2FtZSBuYW1lLicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vcmVtb3ZlIGxhc3QgYWRkZWQgcm93IGlmIGl0J3MgZW1wdHlcbiAgICBpZihPYmplY3Qua2V5cyh0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXSkubGVuZ3RoID09PSAwKSB7XG4gICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XS5zcGxpY2UoaiwgMSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAoY2h1bmtSb3dDb3VudCA+IGNodW5rVGhyZXNob2xkKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1JvdyAnICsgaiArICcgZXhjZWVkcyBzaXplIGxpbWl0IG9mIDMya2InKTtcbiAgICB9IGVsc2UgaWYoY2h1bmtBcnJheUNvdW50ICsgY2h1bmtSb3dDb3VudCA+IGNodW5rVGhyZXNob2xkKSB7XG4gICAgICAvL2NyZWF0ZSBuZXcgYXJyYXkgaWYgdGhpcyBvbmUgaXMgZnVsbCBhbmQgbW92ZSB0aGUgbGFzdCBpdGVtIHRvIHRoZSBuZXcgYXJyYXlcbiAgICAgIHZhciBsYXN0Um93ID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0ucG9wKCk7IC8vIGdldCByaWQgb2YgdGhhdCBsYXN0IHJvd1xuICAgICAgY3VycmVudFRhcmdldCsrOyAvLyBtb3ZlIG9udG8gdGhlIG5leHQgYXJyYXlcbiAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdICA9IFtsYXN0Um93XTsgLy8gbWFrZSBpdCBhbiBhcnJheVxuICAgICAgaiAgICAgICAgICAgICAgICAgICAgICAgICAgID0gMDsgLy8gaW5pdGlhbGlzZSBuZXcgcm93IGNvdW50ZXIgZm9yIG5ldyBhcnJheSAtIGl0IHdpbGwgYmUgaW5jcmVtZW50ZWQgYXQgdGhlIGVuZCBvZiB0aGUgZnVuY3Rpb25cbiAgICAgIGNodW5rQXJyYXlDb3VudCAgICAgICAgICAgICA9IGNodW5rUm93Q291bnQ7IC8vIHRoaXMgaXMgdGhlIG5ldyBjaHVuayBtYXggc2l6ZVxuICAgIH0gZWxzZSB7XG4gICAgICBjaHVua0FycmF5Q291bnQgPSBjaHVua0FycmF5Q291bnQgKyBjaHVua1Jvd0NvdW50O1xuICAgIH1cbiAgICBqKys7XG4gIH1cblxuICAvLyByZWZvcm1hdCBleGlzdGluZ0NvbHMgaW50byBhbiBhcnJheSBzbyBzYXMgY2FuIHBhcnNlIGl0O1xuICB2YXIgc3BlY0FycmF5ID0gW107XG4gIGZvciAodmFyIGsgaW4gZXhpc3RpbmdDb2xzKSB7XG4gICAgc3BlY0FycmF5LnB1c2goZXhpc3RpbmdDb2xzW2tdKTtcbiAgfVxuICByZXR1cm4ge1xuICAgIHNwZWM6ICAgICAgIHNwZWNBcnJheSxcbiAgICBkYXRhOiAgICAgICB0YXJnZXRBcnJheSxcbiAgICBqc29uTGVuZ3RoOiBjaHVua0FycmF5Q291bnRcbiAgfTsgLy8gdGhlIHNwZWMgd2lsbCBiZSB0aGUgbWFjcm9bMF0sIHdpdGggdGhlIGRhdGEgc3BsaXQgaW50byBhcnJheXMgb2YgbWFjcm9bMS1uXVxuICAvLyBtZWFucyBpbiB0ZXJtcyBvZiBkb2pvIHhociBvYmplY3QgYXQgbGVhc3QgdGhleSBuZWVkIHRvIGdvIGludG8gdGhlIHNhbWUgYXJyYXlcbn07XG5cbi8qXG4qIENvbnZlcnQgamF2YXNjcmlwdCBkYXRlIHRvIHNhcyB0aW1lXG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBqc0RhdGUgLSBqYXZhc2NyaXB0IERhdGUgb2JqZWN0XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMudG9TYXNEYXRlVGltZSA9IGZ1bmN0aW9uIChqc0RhdGUpIHtcbiAgdmFyIGJhc2VkYXRlID0gbmV3IERhdGUoXCJKYW51YXJ5IDEsIDE5NjAgMDA6MDA6MDBcIik7XG4gIHZhciBjdXJyZGF0ZSA9IGpzRGF0ZTtcblxuICAvLyBvZmZzZXRzIGZvciBVVEMgYW5kIHRpbWV6b25lcyBhbmQgQlNUXG4gIHZhciBiYXNlT2Zmc2V0ID0gYmFzZWRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xuICB2YXIgY3Vyck9mZnNldCA9IGN1cnJkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcblxuICAvLyBjb252ZXJ0IGN1cnJkYXRlIHRvIGEgc2FzIGRhdGV0aW1lXG4gIHZhciBvZmZzZXRTZWNzICAgID0gKGN1cnJPZmZzZXQgLSBiYXNlT2Zmc2V0KSAqIDYwOyAvLyBvZmZzZXREaWZmIGlzIGluIG1pbnV0ZXMgdG8gc3RhcnQgd2l0aFxuICB2YXIgYmFzZURhdGVTZWNzICA9IGJhc2VkYXRlLmdldFRpbWUoKSAvIDEwMDA7IC8vIGdldCByaWQgb2YgbXNcbiAgdmFyIGN1cnJkYXRlU2VjcyAgPSBjdXJyZGF0ZS5nZXRUaW1lKCkgLyAxMDAwOyAvLyBnZXQgcmlkIG9mIG1zXG4gIHZhciBzYXNEYXRldGltZSAgID0gTWF0aC5yb3VuZChjdXJyZGF0ZVNlY3MgLSBiYXNlRGF0ZVNlY3MgLSBvZmZzZXRTZWNzKTsgLy8gYWRqdXN0XG5cbiAgcmV0dXJuIHNhc0RhdGV0aW1lO1xufTtcbiJdfQ==
