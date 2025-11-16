import { executeBusinessQuery } from '@/lib/database.js'
import { ApiResponse } from '@/lib/session.js'
import logger from '@/lib/logger.js'
import { requireAdminAuth } from '@/lib/adminAuth.js'

/**
 * Generate a unique slug
 */
async function generateUniqueSlug(baseSlug, excludeId = null) {
  let slug = baseSlug
  let counter = 1

  while (true) {
    const query = excludeId
      ? 'SELECT COUNT(*) AS cnt FROM blog WHERE slug = ? AND id != ?'
      : 'SELECT COUNT(*) AS cnt FROM blog WHERE slug = ?'
    const params = excludeId ? [slug, excludeId] : [slug]
    
    const rows = await executeBusinessQuery(query, params)
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
    if (req.method !== 'POST') {
      return res.status(405).json(ApiResponse.error('Method not allowed', 405))
    }

    const admin = await requireAdminAuth(req, res)
    if (!admin) return

    const {
      title,
      slug: providedSlug,
      content,
      content_type = 'content',
      blog_for = 'customer',
      blog_prompt = null,
      excerpt,
      featured_image = null,
      featured_image_alt = '',
      status = 'draft',
      author_id,
      blog_group_id = null,
      seo_title = null,
      seo_description = null,
      seo_keywords = null,
      og_image = null,
      scheduled_publish = null,
      automation_source = 'manual',
      rich_schema = null,
    } = req.body || {}

    // Validation
    if (!title || !content || !excerpt) {
      return res.status(422).json(
        ApiResponse.validation({
          title: 'required',
          content: 'required',
          excerpt: 'required',
        })
      )
    }

    if (!author_id) {
      return res.status(422).json(
        ApiResponse.validation({ author_id: 'required' })
      )
    }

    // Validate status
    if (!['draft', 'published', 'scheduled'].includes(status)) {
      return res.status(422).json(
        ApiResponse.validation({ status: 'must be draft, published, or scheduled' })
      )
    }

    // Validate blog_for
    if (!['customer', 'service_provider'].includes(blog_for)) {
      return res.status(422).json(
        ApiResponse.validation({ blog_for: 'must be customer or service_provider' })
      )
    }

    // Generate unique slug
    const baseSlug = providedSlug ? cleanSlug(providedSlug) : cleanSlug(title)
    const uniqueSlug = await generateUniqueSlug(baseSlug)

    // Prepare JSON fields
    const seoKeywordsJson = seo_keywords ? JSON.stringify(seo_keywords) : null
    const richSchemaJson = rich_schema ? JSON.stringify(rich_schema) : null

    // Set published_at if status is published
    const publishedAt = status === 'published' ? 'NOW()' : null

    // Insert blog post
    const insertQuery = `
      INSERT INTO blog (
        title, slug, content, content_type, blog_for, blog_prompt,
        excerpt, featured_image, featured_image_alt, status,
        author_id, blog_group_id, seo_title, seo_description, seo_keywords,
        og_image, scheduled_publish, published_at, automation_source, rich_schema,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${publishedAt || 'NULL'}, ?, ?, NOW(), NOW())
    `

    const result = await executeBusinessQuery(insertQuery, [
      title,
      uniqueSlug,
      content,
      content_type,
      blog_for,
      blog_prompt,
      excerpt,
      featured_image,
      featured_image_alt,
      status,
      author_id,
      blog_group_id,
      seo_title,
      seo_description,
      seoKeywordsJson,
      og_image,
      scheduled_publish,
      automation_source,
      richSchemaJson,
    ])

    const blogId = result.insertId

    logger.info('Blog post created', { blog_id: blogId, title, slug: uniqueSlug })

    return res.status(201).json(
      ApiResponse.success(
        {
          id: blogId,
          slug: uniqueSlug,
          status,
        },
        'Blog post created successfully'
      )
    )
  } catch (error) {
    logger.error('admin/blog/posts/create error', { error: error.message, stack: error.stack })
    return res.status(500).json(ApiResponse.error('Failed to create blog post'))
  }
}
