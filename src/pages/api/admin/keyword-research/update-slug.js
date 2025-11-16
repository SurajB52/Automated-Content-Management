import { executeBusinessQuery } from '@/lib/database.js'
import { ApiResponse } from '@/lib/session.js'
import logger from '@/lib/logger.js'
import { requireAdminAuth } from '@/lib/adminAuth.js'

function formatSlug(input) {
  let slug = String(input || '').toLowerCase().trim()
  slug = slug.replace(/[^a-z0-9-]/g, '-')
  slug = slug.replace(/-+/g, '-')
  slug = slug.replace(/^-+|-+$/g, '')
  return slug
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json(ApiResponse.error('Method not allowed', 405))
    }

    const admin = await requireAdminAuth(req, res)
    if (!admin) return

    const { blog_id, slug } = req.body || {}

    if (!blog_id || !slug) {
      return res.status(422).json(ApiResponse.validation({ blog_id: 'required', slug: 'required' }))
    }

    const blogId = parseInt(blog_id, 10)
    const clean = formatSlug(slug)

    if (!clean) {
      return res.status(422).json(ApiResponse.validation({ slug: 'cannot be empty' }))
    }

    // Check if slug already exists for another blog post
    const rows = await executeBusinessQuery(
      'SELECT id FROM blog WHERE slug = ? AND id != ? LIMIT 1',
      [clean, blogId]
    )

    if (rows && rows.length > 0) {
      return res.status(409).json(ApiResponse.error('This URL slug is already in use'))
    }

    // Update slug
    const result = await executeBusinessQuery(
      'UPDATE blog SET slug = ?, updated_at = NOW() WHERE id = ? LIMIT 1',
      [clean, blogId]
    )

    if (!result || result.affectedRows === 0) {
      logger.error('Failed to update blog slug', { blog_id: blogId, slug: clean })
      return res.status(500).json(ApiResponse.error('Failed to update URL slug'))
    }

    return res.status(200).json(
      ApiResponse.success({ slug: clean }, 'URL slug updated successfully')
    )
  } catch (error) {
    logger.error('admin/keyword-research/update-slug error', { error: error.message, stack: error.stack })
    return res.status(500).json(ApiResponse.error('An error occurred while updating the URL slug'))
  }
}
