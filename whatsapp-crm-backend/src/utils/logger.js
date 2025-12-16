// /**
//  * Log HTTP request with timestamp
//  * @param {string} method - HTTP method
//  * @param {string} path - Request path
//  * @param {number} status - HTTP status code
//  */
// const logRequest = (method, path, status) => {
//   const timestamp = new Date().toISOString();
//   const statusEmoji = status >= 500 ? '❌' : status >= 400 ? '⚠️' : '✓';
//   console.log(`${statusEmoji} [${timestamp}] ${method} ${path} - ${status}`);
// };

// /**
//  * Log info message
//  * @param {string} message - Message to log
//  * @param {object} data - Additional data
//  */
// const logInfo = (message, data = {}) => {
//   console.log(`ℹ️ [${new Date().toISOString()}] ${message}`, data);
// };

// /**
//  * Log error message
//  * @param {string} message - Error message
//  * @param {Error} error - Error object
//  */
// const logError = (message, error = null) => {
//   console.error(`❌ [${new Date().toISOString()}] ${message}`);
//   if (error) {
//     console.error('Error details:', error);
//   }
// };

// /**
//  * Log warning message
//  * @param {string} message - Warning message
//  * @param {object} data - Additional data
//  */
// const logWarning = (message, data = {}) => {
//   console.warn(`⚠️ [${new Date().toISOString()}] ${message}`, data);
// };


// // // Logger utility with all required methods

// // const logger = {
// //   info: (method, path, status) => {
// //     console.log(`[${new Date().toISOString()}] ${method} ${path} - ${status}`);
// //   },
  
// //   error: (message, error) => {
// //     console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error);
// //   },
  
// //   warn: (message) => {
// //     console.warn(`[${new Date().toISOString()}] WARN: ${message}`);
// //   },
  
// //   debug: (message, data) => {
// //     if (process.env.NODE_ENV === 'development') {
// //       console.log(`[${new Date().toISOString()}] DEBUG: ${message}`, data || '');
// //     }
// //   }
// // };


// /**
//  * Simple logger utility with consistent interface
//  */

// const logger = {
//   /**
//    * Log info message
//    */
//   info: (message, data = null) => {
//     const timestamp = new Date().toISOString();
//     if (data) {
//       console.log(`ℹ️ [${timestamp}] ${message}`, JSON.stringify(data, null, 2));
//     } else {
//       console.log(`ℹ️ [${timestamp}] ${message}`);
//     }
//   },

//   /**
//    * Log error message
//    */
//   error: (message, error = null) => {
//     const timestamp = new Date().toISOString();
//     console.error(`❌ [${timestamp}] ${message}`);
//     if (error) {
//       if (error.stack) {
//         console.error('Stack trace:', error.stack);
//       } else {
//         console.error('Error details:', error);
//       }
//     }
//   },

//   /**
//    * Log warning message
//    */
//   warn: (message, data = null) => {
//     const timestamp = new Date().toISOString();
//     if (data) {
//       console.warn(`⚠️ [${timestamp}] ${message}`, JSON.stringify(data, null, 2));
//     } else {
//       console.warn(`⚠️ [${timestamp}] ${message}`);
//     }
//   },

//   /**
//    * Log debug message
//    */
//   debug: (message, data = null) => {
//     if (process.env.NODE_ENV === 'development') {
//       const timestamp = new Date().toISOString();
//       if (data) {
//         console.log(`🔍 [${timestamp}] ${message}`, JSON.stringify(data, null, 2));
//       } else {
//         console.log(`🔍 [${timestamp}] ${message}`);
//       }
//     }
//   },

//   /**
//    * Log HTTP request
//    */
//   request: (method, path, status) => {
//     const timestamp = new Date().toISOString();
//     const statusEmoji = status >= 500 ? '❌' : status >= 400 ? '⚠️' : '✓';
//     console.log(`${statusEmoji} [${timestamp}] ${method} ${path} - ${status}`);
//   }
// };

// // module.exports = logger;

// // module.exports = {
// //   logRequest,
// //   logInfo,
// //   logError,
// //   logWarning,
// //   logger
// // };


// module.exports = {
//   logger,
//   logRequest,
//   logInfo,
//   logError,
//   logWarning
// };







/**
 * Log HTTP request with timestamp
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @param {number} status - HTTP status code
 */
const logRequest = (method, path, status) => {
  const timestamp = new Date().toISOString();
  const statusEmoji = status >= 500 ? "❌" : status >= 400 ? "⚠️" : "✓";
  console.log(`${statusEmoji} [${timestamp}] ${method} ${path} - ${status}`);
};

/**
 * Log info message
 */
const logInfo = (message, data = {}) => {
  console.log(`ℹ️ [${new Date().toISOString()}] ${message}`, data);
};

/**
 * Log error message
 */
const logError = (message, error = null) => {
  console.error(`❌ [${new Date().toISOString()}] ${message}`);
  if (error) {
    console.error("Error details:", error);
  }
};

/**
 * Log warning message
 */
const logWarning = (message, data = {}) => {
  console.warn(`⚠️ [${new Date().toISOString()}] ${message}`, data);
};

/**
 * Logger object with consistent interface
 */
const logger = {
  info: (message, data = null) => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`ℹ️ [${timestamp}] ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`ℹ️ [${timestamp}] ${message}`);
    }
  },

  error: (message, error = null) => {
    const timestamp = new Date().toISOString();
    console.error(`❌ [${timestamp}] ${message}`);
    if (error) {
      if (error.stack) console.error("Stack trace:", error.stack);
      else console.error("Error details:", error);
    }
  },

  warn: (message, data = null) => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.warn(`⚠️ [${timestamp}] ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.warn(`⚠️ [${timestamp}] ${message}`);
    }
  },

  debug: (message, data = null) => {
    if (process.env.NODE_ENV === "development") {
      const timestamp = new Date().toISOString();
      if (data) {
        console.log(`🔍 [${timestamp}] ${message}`, JSON.stringify(data, null, 2));
      } else {
        console.log(`🔍 [${timestamp}] ${message}`);
      }
    }
  },

  request: (method, path, status) => {
    const timestamp = new Date().toISOString();
    const statusEmoji = status >= 500 ? "❌" : status >= 400 ? "⚠️" : "✓";
    console.log(`${statusEmoji} [${timestamp}] ${method} ${path} - ${status}`);
  }
};

module.exports = {
  logRequest,
  logInfo,
  logError,
  logWarning,
  logger
};
