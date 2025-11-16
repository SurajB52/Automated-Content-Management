import { ApiResponse } from '@/lib/session.js'
import { requireAdminAuth } from '@/lib/adminAuth.js'
import logger from '@/lib/logger.js'
import { executeBusinessQuery } from '@/lib/database.js'

export default async function handler(req, res) {
  const admin = await requireAdminAuth(req, res)
  if (!admin) return

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json(ApiResponse.error('Method not allowed', 405))
  }

  try {
    const page = parseInt(req.query.page) || 1
    const perPage = parseInt(req.query.perPage) || 15
    const offset = (page - 1) * perPage

    // Get total count
    const countResult = await executeBusinessQuery(
      'SELECT COUNT(*) as total FROM blog_gallery_images'
    )
    const total = countResult[0]?.total || 0

    // Get paginated images
    const images = await executeBusinessQuery(
      `SELECT id, url, alt, created_at 
       FROM blog_gallery_images 
       ORDER BY created_at DESC 
       LIMIT ${perPage} OFFSET ${offset}`
    )

    const totalPages = Math.ceil(total / perPage)

    return res.status(200).json(
      ApiResponse.success({
        images,
        pagination: {
          page,
          perPage,
          total,
          totalPages
        }
      })
    )
  } catch (error) {
    logger.error('Blog gallery list failed', { error: error.message })
    return res.status(500).json(ApiResponse.error('Failed to fetch images'))
  }
}
