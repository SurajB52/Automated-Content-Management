import { executeBusinessQuery } from '@/lib/database.js'
import { ApiResponse } from '@/lib/session.js'
import logger from '@/lib/logger.js'
import { requireAdminAuth } from '@/lib/adminAuth.js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
      return res.status(405).json(ApiResponse.error('Method not allowed', 405))
    }

    const admin = await requireAdminAuth(req, res)
    if (!admin) return

    const { id, blog_generated } = req.body || {}

    if (!id) {
      return res.status(422).json(ApiResponse.validation({ id: 'required' }))
    }

    // Validate blog_generated as 0 or 1
    const bg = Number(blog_generated)
    if (!(bg === 0 || bg === 1)) {
      return res.status(422).json(
        ApiResponse.validation({ blog_generated: 'must be 0 or 1' })
      )
    }

    // Ensure record exists
    const exists = await executeBusinessQuery(
      'SELECT id FROM keyword_research WHERE id = ? LIMIT 1',
      [id]
    )

    if (!exists || exists.length === 0) {
      return res.status(404).json(ApiResponse.notFound(`Record with ID ${id} not found`))
    }

    // Update status
    await executeBusinessQuery(
      'UPDATE keyword_research SET blog_generated = ? WHERE id = ? LIMIT 1',
      [bg, id]
    )

    logger.info('keyword_research blog_generated updated', { id, blog_generated: bg })

    return res.status(200).json(
      ApiResponse.success(
        { id, blog_generated: bg },
        'Record updated successfully'
      )
    )
  } catch (error) {
    logger.error('admin/keyword-research/update-blog-status error', { error: error.message, stack: error.stack })
    return res.status(500).json(ApiResponse.error('Failed to update blog status'))
  }
}
