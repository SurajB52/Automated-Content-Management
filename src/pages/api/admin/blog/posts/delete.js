import { executeBusinessQuery } from '@/lib/database.js'
import { ApiResponse } from '@/lib/session.js'
import logger from '@/lib/logger.js'
import { requireAdminAuth } from '@/lib/adminAuth.js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'DELETE' && req.method !== 'POST') {
      return res.status(405).json(ApiResponse.error('Method not allowed', 405))
    }

    const admin = await requireAdminAuth(req, res)
    if (!admin) return

    // Support both DELETE (query param) and POST (body)
    const id = req.method === 'DELETE' 
      ? parseInt(req.query.id, 10) 
      : parseInt(req.body?.id, 10)

    if (!id || id <= 0) {
      return res.status(422).json(ApiResponse.validation({ id: 'Valid id is required' }))
    }

    // Check if blog exists
    const existing = await executeBusinessQuery(
      'SELECT id, title FROM blog WHERE id = ? LIMIT 1',
      [id]
    )

    if (!existing || existing.length === 0) {
      return res.status(404).json(ApiResponse.notFound('Blog post not found'))
    }

    const post = existing[0]

    // Delete related records first (to maintain referential integrity)
    
    // Delete blog images
    await executeBusinessQuery('DELETE FROM blog_images WHERE blog_id = ?', [id])

    // Delete blog quotes
    await executeBusinessQuery('DELETE FROM blog_quotes WHERE blog_id = ?', [id])

    // Delete blog comments
    await executeBusinessQuery('DELETE FROM blog_comments WHERE blog_id = ?', [id])

    // Delete blog rewrite logs
    await executeBusinessQuery('DELETE FROM blog_rewrite_logs WHERE blog_id = ?', [id])

    // Update keyword_research to remove blog reference
    await executeBusinessQuery(
      'UPDATE keyword_research SET blog_id = NULL, blog_generated = 0 WHERE blog_id = ?',
      [id]
    )

    // Finally, delete the blog post
    const result = await executeBusinessQuery('DELETE FROM blog WHERE id = ? LIMIT 1', [id])

    if (result.affectedRows === 0) {
      return res.status(404).json(ApiResponse.notFound('Blog post not found'))
    }

    logger.info('Blog post deleted', { blog_id: id, title: post.title })

    return res.status(200).json(
      ApiResponse.success(
        { id, deleted: true },
        'Blog post deleted successfully'
      )
    )
  } catch (error) {
    logger.error('admin/blog/posts/delete error', { error: error.message, stack: error.stack })
    return res.status(500).json(ApiResponse.error('Failed to delete blog post'))
  }
}
