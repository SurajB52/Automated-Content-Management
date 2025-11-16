import { executeBusinessQuery } from '@/lib/database.js'
import { ApiResponse } from '@/lib/session.js'
import logger from '@/lib/logger.js'
import { requireAdminAuth } from '@/lib/adminAuth.js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json(ApiResponse.error('Method not allowed', 405))
    }

    const admin = await requireAdminAuth(req, res)
    if (!admin) return

    // Get all blog groups
    const query = `
      SELECT 
        id,
        name,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
      FROM blog_groups
      ORDER BY name ASC
    `

    const groups = await executeBusinessQuery(query)

    return res.status(200).json(
      ApiResponse.success(groups || [], 'Blog groups retrieved successfully')
    )
  } catch (error) {
    logger.error('admin/blog/groups error', { 
      error: error.message, 
      stack: error.stack 
    })
    return res.status(500).json(
      ApiResponse.error('Failed to load blog groups')
    )
  }
}
