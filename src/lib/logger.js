// Dynamically load Node.js modules only when running on the server. This avoids
// bundler errors in client-side builds that can't include "node:*" modules.
let fs = null;
let path = null;

// Detect Node.js runtime (no window object and process.versions.node defined)
const isNode = typeof window === 'undefined' && typeof process !== 'undefined' && !!process.versions?.node;

if (isNode) {
  try {
    // Use eval to prevent bundlers from statically analysing this require.
    const req = eval('require');
    fs = req('node:fs');
    path = req('node:path');
  } catch (error) {
    console.warn('[logger] Failed to load fs/path modules:', error);
  }
}

// Create logs directory if it doesn't exist
const logsDir = isNode && path ? path.join(process.cwd(), 'logs') : null;

if (isNode && fs && logsDir && !fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create logs directory:', error);
  }
}

// Log file paths
const errorLogPath = logsDir && path ? path.join(logsDir, 'error.log') : null;
const accessLogPath = logsDir && path ? path.join(logsDir, 'access.log') : null;

// Log level configuration - set to false to disable verbose logging
const LOG_CONFIG = {
  ENABLE_INFO_LOGS: true,         // Enable INFO and WARN logs for better visibility
  ENABLE_QUERY_LOGS: true,       // Disable QUERY logs (SQL queries)
  ENABLE_CONNECTION_LOGS: true,  // Disable database connection logs
  ENABLE_ERROR_LOGS: true         // Keep ERROR logs for debugging
};

/**
 * Format a log message with timestamp and additional data
 * @param {string} level - Log level (ERROR, INFO, etc.)
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 * @returns {string} - Formatted log message
 */
const formatLogMessage = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  let formattedData = '';
  
  if (Object.keys(data).length > 0) {
    try {
      formattedData = JSON.stringify(data, null, 2);
    } catch (error) {
      formattedData = 'Error stringifying data: ' + error.message;
    }
  }

  return `[${timestamp}] [${level}] ${message}\n${formattedData ? formattedData + '\n' : ''}`;
};

/**
 * Write a log entry to a file
 * @param {string} filePath - Path to log file
 * @param {string} message - Log message
 */
const writeLog = (filePath, message) => {
  // Skip if not running in Node or fs/path couldn't be loaded
  if (!isNode || !fs || !filePath) return;

  try {
    fs.appendFileSync(filePath, message);
  } catch (error) {
    console.error(`Failed to write to log file ${filePath}:`, error);
  }
};

/**
 * Log an error message
 * @param {string} message - Error message
 * @param {Object} data - Additional error data
 */
const error = (message, data = {}) => {
  if (!LOG_CONFIG.ENABLE_ERROR_LOGS) return;
  
  const logMessage = formatLogMessage('ERROR', message, data);
  console.error(logMessage);
  writeLog(errorLogPath, logMessage);
};

/**
 * Log an info message
 * @param {string} message - Info message
 * @param {Object} data - Additional info data
 */
const info = (message, data = {}) => {
  if (!LOG_CONFIG.ENABLE_INFO_LOGS) return;
  
  const logMessage = formatLogMessage('INFO', message, data);
  console.log(logMessage);
  writeLog(accessLogPath, logMessage);
};

/**
 * Log a database connection message
 * @param {string} message - Connection message
 * @param {Object} data - Additional connection data
 */
const connection = (message, data = {}) => {
  if (!LOG_CONFIG.ENABLE_CONNECTION_LOGS) return;
  
  const logMessage = formatLogMessage('CONNECTION', message, data);
  console.log(logMessage);
  writeLog(accessLogPath, logMessage);
};

/**
 * Log an auth-related message
 * @param {string} message - Auth message
 * @param {Object} data - Additional auth data
 */
const auth = (message, data = {}) => {
  if (!LOG_CONFIG.ENABLE_INFO_LOGS) return;
  
  // Sanitize sensitive data
  const sanitizedData = { ...data };
  if (sanitizedData.password) sanitizedData.password = '********';
  if (sanitizedData.token) sanitizedData.token = '********';
  if (sanitizedData.sessionId) sanitizedData.sessionId = sanitizedData.sessionId.slice(0, 10) + '...';
  
  const logMessage = formatLogMessage('AUTH', message, sanitizedData);
  console.log(logMessage);
  writeLog(accessLogPath, logMessage);
};

/**
 * Log a database query (for debugging)
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 */
const query = (query, params = []) => {
  if (!LOG_CONFIG.ENABLE_QUERY_LOGS) return;
  
  // Only log in development
  if (process.env.NODE_ENV !== 'production') {
    const sanitizedParams = params.map(param => 
      typeof param === 'string' && param.length > 100 
        ? param.substring(0, 50) + '...' 
        : param
    );
    
    const logMessage = formatLogMessage('QUERY', query, { params: sanitizedParams });
    writeLog(accessLogPath, logMessage);
  }
};

/**
 * Log a warning message
 * @param {string} message - Warning message
 * @param {Object} data - Additional warning data
 */
const warn = (message, data = {}) => {
  if (!LOG_CONFIG.ENABLE_INFO_LOGS) return;
  
  const logMessage = formatLogMessage('WARN', message, data);
  console.warn(logMessage);
  writeLog(accessLogPath, logMessage);
};

// Add debug-level logging (only in development or when explicitly enabled)
const debug = (message, data = {}) => {
  // Disable debug logs in production unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DEBUG_LOGS) return;

  const logMessage = formatLogMessage('DEBUG', message, data);
  console.debug(logMessage);
  writeLog(accessLogPath, logMessage);
};

const logger = {
  error,
  info,
  warn,
  connection,
  auth,
  query,
  debug
};

export default logger; 