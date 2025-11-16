import mysql from 'mysql2/promise';
import logger from './logger.js';

// Helper to parse integer envs safely
const envInt = (val, fallback) => {
  const n = parseInt(String(val ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Main Database configuration (read-only access)
// For local development, we default to root/no-password and a local DB name.
// In production, provide explicit MAIN_DB_* env vars (no hardcoded secrets).
const MAIN_DB_CONFIG = {
  host: process.env.MAIN_DB_HOST || process.env.DB_HOST || 'localhost',
  user: process.env.MAIN_DB_USER || process.env.DB_USER || 'root',
  password: process.env.MAIN_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
  database: process.env.MAIN_DB_NAME || process.env.DB_NAME || 'app',
  port: parseInt(process.env.MAIN_DB_PORT || process.env.DB_PORT || '3306', 10),
  charset: 'utf8mb4',
  // Keep per-process pool small. Can be overridden via env.
  connectionLimit: envInt(process.env.MAIN_DB_CONNECTION_LIMIT, 10),
  queueLimit: 0,
  waitForConnections: true,
  idleTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: false,
  namedPlaceholders: false
};

// Business Database configuration (full access)
// Defaults mirror MAIN_* when BUSINESS_* is not provided.
const BUSINESS_DB_CONFIG = {
  host: process.env.BUSINESS_DB_HOST || process.env.MAIN_DB_HOST || process.env.DB_HOST || 'localhost',
  user: process.env.BUSINESS_DB_USER || process.env.MAIN_DB_USER || process.env.DB_USER || 'root',
  password: (process.env.BUSINESS_DB_PASSWORD ?? process.env.MAIN_DB_PASSWORD ?? process.env.DB_PASSWORD) ?? '',
  database: process.env.BUSINESS_DB_NAME || process.env.MAIN_DB_NAME || process.env.DB_NAME || 'app',
  port: parseInt(process.env.BUSINESS_DB_PORT || process.env.MAIN_DB_PORT || process.env.DB_PORT || '3306', 10),
  charset: 'utf8mb4',
  // Keep per-process pool small. Can be overridden via env.
  connectionLimit: envInt(process.env.BUSINESS_DB_CONNECTION_LIMIT, 10),
  queueLimit: 0,
  waitForConnections: true,
  idleTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: false,
  namedPlaceholders: false
};

// Website configuration variables
const WEBSITE_CONFIG = {
  SITE_NAME: 'Example',
  SITE_TAGLINE: 'Professional Business Quote Management System',
  COMPANY_NAME: 'Example Solutions',
  COMPANY_EMAIL: 'info@example.com',
  COMPANY_PHONE: '+1-555-0123',
  COMPANY_ADDRESS: '123 Business Street, Suite 100, Business City, BC 12345',
  
  // System settings
  SESSION_TIMEOUT: parseInt(process.env.SESSION_TIMEOUT) || 3600, // 1 hour in seconds
  MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  PASSWORD_MIN_LENGTH: 8,
  
  // File upload settings
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
  ALLOWED_FILE_TYPES: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'],
  
  // Business settings
  DEFAULT_CURRENCY: 'AUD',
  TAX_RATE: 0.1, // 10%
  QUOTE_VALIDITY_DAYS: 60,
  
  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100
};

// Create connection pools (singleton across hot reloads)
// Use globalThis to avoid creating multiple pools in dev/hot-reload or serverless contexts
let mainPool = globalThis.__app_mainPool || null;
let businessPool = globalThis.__app_businessPool || null;

// Toggle verbose DB connection logs via env var
const SHOULD_LOG_DB_CONNECTIONS = process.env.LOG_DB_CONNECTIONS === 'true';

const createMainPool = () => {
  try {
    if (mainPool) {
      return mainPool; // Return existing pool if already created
    }
    mainPool = mysql.createPool(MAIN_DB_CONFIG);
    // Expose on global for reuse across reloads
    globalThis.__app_mainPool = mainPool;
    
    // Set max listeners to prevent warnings
    mainPool.setMaxListeners(20);
    
    if (SHOULD_LOG_DB_CONNECTIONS) {
      logger.connection('Main database connection pool created successfully');
    }
    return mainPool;
  } catch (error) {
    logger.error('Error creating main database connection pool:', { error: error.message, stack: error.stack });
    throw error;
  }
};

const createBusinessPool = () => {
  try {
    if (businessPool) {
      return businessPool; // Return existing pool if already created
    }
    businessPool = mysql.createPool(BUSINESS_DB_CONFIG);
    // Expose on global for reuse across reloads
    globalThis.__app_businessPool = businessPool;
    
    // Set max listeners to prevent warnings
    businessPool.setMaxListeners(20);
    
    if (SHOULD_LOG_DB_CONNECTIONS) {
      logger.connection('Business database connection pool created successfully');
    }
    return businessPool;
  } catch (error) {
    logger.error('Error creating business database connection pool:', { error: error.message, stack: error.stack });
    throw error;
  }
};

// Initialize pools on module load
(() => {
  try {
    createMainPool();
    createBusinessPool();
    if (SHOULD_LOG_DB_CONNECTIONS) {
      logger.connection('Database connection pools initialized successfully');
    }
  } catch (error) {
    logger.error('Failed to initialize database connection pools:', { error: error.message, stack: error.stack });
  }
})();

// Get main database connection (read-only)
const getMainConnection = async () => {
  try {
    if (!mainPool) {
      createMainPool();
    }
    
    const connection = await mainPool.getConnection();
    if (SHOULD_LOG_DB_CONNECTIONS) {
      logger.connection('Main database connection established');
    }
    
    return connection;
  } catch (error) {
    logger.error('Error getting main database connection:', { error: error.message, stack: error.stack });
    // Try to recreate pool if connection fails
    if (error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ECONNREFUSED') {
      logger.info('Attempting to recreate main database pool...');
      mainPool = null;
      createMainPool();
    }
    throw new Error('Main database connection failed');
  }
};

// Get business database connection (full access)
const getBusinessConnection = async () => {
  try {
    if (!businessPool) {
      createBusinessPool();
    }
    
    const connection = await businessPool.getConnection();
    if (SHOULD_LOG_DB_CONNECTIONS) {
      logger.connection('Business database connection established');
    }
    
    return connection;
  } catch (error) {
    logger.error('Error getting business database connection:', { error: error.message, stack: error.stack });
    // Try to recreate pool if connection fails
    if (error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ECONNREFUSED') {
      logger.info('Attempting to recreate business database pool...');
      businessPool = null;
      createBusinessPool();
    }
    throw new Error('Business database connection failed');
  }
};

// Legacy method for backward compatibility - defaults to business database
const getConnection = async () => {
  return await getBusinessConnection();
};

// Test main database connection
const testMainConnection = async () => {
  try {
    const connection = await getMainConnection();
    await connection.execute('SELECT 1');
    connection.release();
    if (SHOULD_LOG_DB_CONNECTIONS) {
      logger.connection('Main database connection test successful');
    }
    return true;
  } catch (error) {
    logger.error('Main database connection test failed:', { error: error.message, stack: error.stack });
    return false;
  }
};

// Test business database connection
const testBusinessConnection = async () => {
  try {
    const connection = await getBusinessConnection();
    await connection.execute('SELECT 1');
    connection.release();
    if (SHOULD_LOG_DB_CONNECTIONS) {
      logger.connection('Business database connection test successful');
    }
    return true;
  } catch (error) {
    logger.error('Business database connection test failed:', { error: error.message, stack: error.stack });
    return false;
  }
};

// Legacy method for backward compatibility
const testConnection = async () => {
  return await testBusinessConnection();
};

// Close database connection pools
const closePool = async () => {
  try {
    if (mainPool) {
      await mainPool.end();
      logger.connection('Main database connection pool closed');
    }
    if (businessPool) {
      await businessPool.end();
      logger.connection('Business database connection pool closed');
    }
  } catch (error) {
    logger.error('Error closing database connection pools:', { error: error.message, stack: error.stack });
  }
};

// Execute query on main database (read-only)
const executeMainQuery = async (query, params = []) => {
  let connection;
  try {
    // Ensure params is an array
    if (!Array.isArray(params)) {
      params = [];
    }
    
    // Convert all parameters to appropriate types and handle undefined values
    const cleanParams = params.map(param => {
      if (param === undefined) {
        return null;
      }
      // Convert numeric strings to numbers for proper binding
      if (typeof param === 'string' && /^\d+$/.test(param)) {
        return parseInt(param, 10);
      }
      return param;
    });
    
    // Count placeholders in query
    const placeholderCount = (query.match(/\?/g) || []).length;
    if (placeholderCount !== cleanParams.length) {
      throw new Error(`Parameter count mismatch: query has ${placeholderCount} placeholders but ${cleanParams.length} parameters provided`);
    }
    
    connection = await getMainConnection();
    logger.query(query, cleanParams);
    const [results] = await connection.execute(query, cleanParams);
    return results;
  } catch (error) {
    // Safe logging without circular references
    logger.error('Main database query execution error:', { 
      error: error.message, 
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      stack: error.stack,
      query: query?.substring(0, 200), // Truncate long queries
      paramCount: params?.length,
      paramTypes: params?.map(p => typeof p),
      paramValues: params?.map(p => p === null ? 'NULL' : p === undefined ? 'UNDEFINED' : String(p).substring(0, 50))
    });
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Execute query on business database (full access)
const executeBusinessQuery = async (query, params = []) => {
  let connection;
  try {
    // Ensure params is an array
    if (!Array.isArray(params)) {
      params = [];
    }
    
    // Convert all parameters to appropriate types and handle undefined values
    const cleanParams = params.map(param => {
      if (param === undefined) {
        return null;
      }
      // Convert numeric strings to numbers for proper binding
      if (typeof param === 'string' && /^\d+$/.test(param)) {
        return parseInt(param, 10);
      }
      return param;
    });
    
    // Count placeholders in query
    const placeholderCount = (query.match(/\?/g) || []).length;
    if (placeholderCount !== cleanParams.length) {
      throw new Error(`Parameter count mismatch: query has ${placeholderCount} placeholders but ${cleanParams.length} parameters provided`);
    }
    
    connection = await getBusinessConnection();
    logger.query(query, cleanParams);
    const [results] = await connection.execute(query, cleanParams);
    return results;
  } catch (error) {
    // Safe logging without circular references
    logger.error('Business database query execution error:', { 
      error: error.message, 
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      stack: error.stack,
      query: query?.substring(0, 200), // Truncate long queries
      paramCount: params?.length,
      paramTypes: params?.map(p => typeof p),
      paramValues: params?.map(p => p === null ? 'NULL' : p === undefined ? 'UNDEFINED' : String(p).substring(0, 50))
    });
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Legacy method for backward compatibility - defaults to business database
const executeQuery = async (query, params = []) => {
  return await executeBusinessQuery(query, params);
};

// Execute transaction on business database
const executeBusinessTransaction = async (queries) => {
  let connection;
  try {
    connection = await getBusinessConnection();
    await connection.beginTransaction();
    
    const results = [];
    for (const queryObj of queries) {
      const { query, params = [] } = queryObj;
      // Validate parameters for each query in transaction
      const cleanParams = Array.isArray(params) ? params.map(param => {
        if (param === undefined) return null;
        if (typeof param === 'string' && /^\d+$/.test(param)) {
          return parseInt(param, 10);
        }
        return param;
      }) : [];
      
      // Count placeholders in query
      const placeholderCount = (query.match(/\?/g) || []).length;
      if (placeholderCount !== cleanParams.length) {
        throw new Error(`Transaction query parameter count mismatch: query has ${placeholderCount} placeholders but ${cleanParams.length} parameters provided`);
      }
      
      logger.query(query, cleanParams);
      const [result] = await connection.execute(query, cleanParams);
      results.push(result);
    }
    
    await connection.commit();
    return results;
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
        logger.info('Transaction rolled back successfully');
      } catch (rollbackError) {
        logger.error('Error during transaction rollback:', { 
          error: rollbackError.message, 
          stack: rollbackError.stack 
        });
      }
    }
    logger.error('Business database transaction error:', { 
      error: error.message, 
      stack: error.stack,
      queries: queries.map(q => ({ query: q.query, paramCount: q.params?.length || 0 }))
    });
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Legacy method for backward compatibility
const executeTransaction = async (queries) => {
  return await executeBusinessTransaction(queries);
};

export {
  // Database configs
  MAIN_DB_CONFIG,
  BUSINESS_DB_CONFIG,
  WEBSITE_CONFIG,
  
  // Connection methods
  getConnection,
  getMainConnection,
  getBusinessConnection,
  
  // Test methods
  testConnection,
  testMainConnection,
  testBusinessConnection,
  
  // Query execution methods
  executeQuery,
  executeMainQuery,
  executeBusinessQuery,
  
  // Transaction methods
  executeTransaction,
  executeBusinessTransaction,
  
  // Pool management
  closePool,
  createMainPool,
  createBusinessPool
}; 