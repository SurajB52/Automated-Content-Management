import { executeBusinessQuery } from '@/lib/database.js'
import { ApiResponse } from '@/lib/session.js'
import logger from '@/lib/logger.js'
import { requireAdminAuth } from '@/lib/adminAuth.js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json(ApiResponse.error('Method not allowed', 405))
    }

    const admin = await requireAdminAuth(req, res)
    if (!admin) return

    const { blog_id, action } = req.body || {}
    if (!blog_id || !['publish', 'unpublish'].includes(String(action))) {
      return res.status(422).json(
        ApiResponse.validation({ blog_id: 'required', action: "must be 'publish' or 'unpublish'" })
      )
    }

    const targetStatus = action === 'publish' ? 'published' : 'draft'

    // Update status; updated_at is maintained
    const result = await executeBusinessQuery(
      'UPDATE blog SET status = ?, updated_at = NOW() WHERE id = ? LIMIT 1',
      [targetStatus, Number(blog_id)]
    )

    if (!result || (result.affectedRows ?? 0) === 0) {
      logger.warn('Blog publish update had no effect', { blog_id, action })
      return res.status(404).json(ApiResponse.notFound('Blog not found'))
    }

    logger.info('Blog status updated', { blog_id, status: targetStatus })
    return res.status(200).json(ApiResponse.success({ blog_id, status: targetStatus }, 'Blog status updated'))
  } catch (error) {
    logger.error('admin/blog/publish error', { error: error.message, stack: error.stack })
    return res.status(500).json(ApiResponse.error('Failed to update blog status'))
  }
}
