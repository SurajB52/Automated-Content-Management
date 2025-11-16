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

    // Parse pagination parameters
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const per_page = Math.min(100, Math.max(1, parseInt(req.query.per_page, 10) || 20))
    const offset = (page - 1) * per_page

    // Parse filter parameters
    const status = req.query.status || null // draft, published, scheduled
    const blog_for = req.query.blog_for || null // customer, service_provider
    const search = req.query.search || null
    const author_id = req.query.author_id ? parseInt(req.query.author_id, 10) : null
    const group_id = req.query.group_id ? parseInt(req.query.group_id, 10) : null

    // Build WHERE clause dynamically
    const conditions = []
    const params = []

    if (status) {
      conditions.push('b.status = ?')
      params.push(status)
    }

    if (blog_for) {
      conditions.push('b.blog_for = ?')
      params.push(blog_for)
    }

    if (author_id) {
      conditions.push('b.author_id = ?')
      params.push(author_id)
    }

    if (group_id) {
      conditions.push('b.blog_group_id = ?')
      params.push(group_id)
    }

    if (search) {
      conditions.push('(b.title LIKE ? OR b.slug LIKE ? OR b.content LIKE ?)')
      const searchTerm = `%${search}%`
      params.push(searchTerm, searchTerm, searchTerm)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get total count
    const countQuery = `SELECT COUNT(*) AS total FROM blog b ${whereClause}`
    const countResult = await executeBusinessQuery(countQuery, params)
    const total = countResult?.[0]?.total || 0
    const totalPages = Math.ceil(total / per_page)

    // Get blog posts
    const dataQuery = `
      SELECT 
        b.id,
        b.title,
        b.slug,
        b.excerpt,
        b.featured_image,
        b.featured_image_alt,
        b.status,
        b.blog_for,
        b.content_type,
        b.author_id,
        ba.name AS author_name,
        b.blog_group_id,
        bg.name AS group_name,
        b.views,
        b.likes,
        b.scheduled_publish,
        b.published_at,
        DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM blog b
      LEFT JOIN blog_authors ba ON b.author_id = ba.id
      LEFT JOIN blog_groups bg ON b.blog_group_id = bg.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT ${per_page} OFFSET ${offset}
    `

    const posts = await executeBusinessQuery(dataQuery, params)

    const payload = {
      posts: posts || [],
      pagination: {
        page,
        per_page,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    }

    return res.status(200).json(ApiResponse.success(payload, 'Blog posts retrieved'))
  } catch (error) {
    logger.error('admin/blog/posts/list error', { error: error.message, stack: error.stack })
    return res.status(500).json(ApiResponse.error('Failed to load blog posts'))
  }
}
