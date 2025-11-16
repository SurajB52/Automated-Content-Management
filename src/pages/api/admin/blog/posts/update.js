import { executeBusinessQuery } from '@/lib/database.js'
import { ApiResponse } from '@/lib/session.js'
import logger from '@/lib/logger.js'
import { requireAdminAuth } from '@/lib/adminAuth.js'

/**
 * Generate a unique slug
 */
async function generateUniqueSlug(baseSlug, excludeId) {
  let slug = baseSlug
  let counter = 1

  while (true) {
    const rows = await executeBusinessQuery(
      'SELECT COUNT(*) AS cnt FROM blog WHERE slug = ? AND id != ?',
      [slug, excludeId]
    )
    const exists = (rows?.[0]?.cnt || 0) > 0

    if (!exists) return slug

    slug = `${baseSlug}-${counter}`
    counter++
  }
}

/**
 * Clean and format slug
 */
function cleanSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200)
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
      return res.status(405).json(ApiResponse.error('Method not allowed', 405))
    }

    const admin = await requireAdminAuth(req, res)
    if (!admin) return

    const { id, ...updates } = req.body || {}

    if (!id) {
      return res.status(422).json(ApiResponse.validation({ id: 'required' }))
    }

    // Check if blog exists
    const existing = await executeBusinessQuery(
      'SELECT id, slug, status FROM blog WHERE id = ? LIMIT 1',
      [id]
    )

    if (!existing || existing.length === 0) {
      return res.status(404).json(ApiResponse.notFound('Blog post not found'))
    }

    // existing[0] contains the current post if needed in future

    // Build dynamic update query
    const updateFields = []
    const updateValues = []

    // Handle slug update only when an explicit slug is provided
    if (updates.slug) {
      const baseSlug = cleanSlug(updates.slug)
      const uniqueSlug = await generateUniqueSlug(baseSlug, id)
      updateFields.push('slug = ?')
      updateValues.push(uniqueSlug)
    }

    // Simple string/text fields
    const simpleFields = [
      'title',
      'content',
      'content_type',
      'blog_for',
      'blog_prompt',
      'excerpt',
      'featured_image',
      'featured_image_alt',
      'status',
      'seo_title',
      'seo_description',
      'og_image',
      'scheduled_publish',
      'automation_source',
      'rewrite',
    ]

    for (const field of simpleFields) {
      if (updates.hasOwnProperty(field) && updates[field] !== undefined) {
        updateFields.push(`${field} = ?`)
        updateValues.push(updates[field])
      }
    }

    // Integer fields
    const intFields = ['author_id', 'blog_group_id', 'views', 'likes']
    for (const field of intFields) {
      if (updates.hasOwnProperty(field) && updates[field] !== undefined) {
        updateFields.push(`${field} = ?`)
        updateValues.push(updates[field])
      }
    }

    // JSON fields
    if (updates.seo_keywords !== undefined) {
      updateFields.push('seo_keywords = ?')
      updateValues.push(
        updates.seo_keywords ? JSON.stringify(updates.seo_keywords) : null
      )
    }

    if (updates.rich_schema !== undefined) {
      updateFields.push('rich_schema = ?')
      updateValues.push(
        updates.rich_schema ? JSON.stringify(updates.rich_schema) : null
      )
    }

    // Handle published_at similar to legacy PHP:
    // - If status === 'published', set published_at = NOW() (even if already published)
    // - If status provided and !== 'published', clear published_at
    if (updates.status === 'published') {
      updateFields.push('published_at = NOW()')
    } else if (updates.status && updates.status !== 'published') {
      updateFields.push('published_at = NULL')
    }

    // Always update updated_at
    updateFields.push('updated_at = NOW()')

    if (updateFields.length === 0) {
      return res.status(400).json(ApiResponse.error('No fields to update'))
    }

    // Execute update
    const updateQuery = `UPDATE blog SET ${updateFields.join(', ')} WHERE id = ? LIMIT 1`
    const result = await executeBusinessQuery(updateQuery, [...updateValues, id])

    if (!result || result.affectedRows === 0) {
      return res.status(404).json(ApiResponse.notFound('Blog post not found'))
    }

    logger.info('Blog post updated', { blog_id: id, fields: updateFields })

    return res.status(200).json(
      ApiResponse.success(
        {
          id,
          updated: true,
        },
        'Blog post updated successfully'
      )
    )
  } catch (error) {
    logger.error('admin/blog/posts/update error', { error: error.message, stack: error.stack })
    return res.status(500).json(ApiResponse.error('Failed to update blog post'))
  }
}
