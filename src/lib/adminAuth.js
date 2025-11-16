// Minimal admin authentication middleware for development
// In production, replace with real auth checks (sessions/JWT).

import logger from './logger.js'

export async function requireAdminAuth(req, res) {
  try {
    // Allow all requests in dev; attach a fake admin user
    req.admin = { id: 'dev-admin', role: 'admin' }
    return req.admin
  } catch (e) {
    logger.error('requireAdminAuth error', { error: e.message })
    res.status(401).json({ success: false, message: 'Unauthorized' })
    return null
  }
}
