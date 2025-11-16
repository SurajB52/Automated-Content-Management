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

    const id = parseInt(req.query.id, 10)
    if (!id || id <= 0) {
      return res.status(422).json(ApiResponse.validation({ id: 'Valid id is required' }))
    }

    // Get blog post with author information
    const rows = await executeBusinessQuery(
      `SELECT 
        b.*,
        ba.name AS author_name,
        ba.email AS author_email,
        bg.name AS group_name,
        DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_fmt,
        DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_fmt,
        DATE_FORMAT(b.published_at, '%Y-%m-%d %H:%i:%s') AS published_at_fmt,
        DATE_FORMAT(b.scheduled_publish, '%Y-%m-%d %H:%i:%s') AS scheduled_publish_fmt
       FROM blog b
       LEFT JOIN blog_authors ba ON b.author_id = ba.id
       LEFT JOIN blog_groups bg ON b.blog_group_id = bg.id
       WHERE b.id = ?
       LIMIT 1`,
      [id]
    )

    if (rows.length === 0) {
      return res.status(404).json(ApiResponse.notFound('Blog post not found'))
    }

    const post = rows[0]

    // Parse JSON fields safely
    let seo_keywords = null
    try {
      seo_keywords = post.seo_keywords ? JSON.parse(post.seo_keywords) : null
    } catch {
      seo_keywords = post.seo_keywords
    }

    let rich_schema = null
    try {
      rich_schema = post.rich_schema ? JSON.parse(post.rich_schema) : null
    } catch {
      rich_schema = null
    }

    // Auto-generate rich schema if none exists (do NOT persist to DB)
    if (rich_schema === null) {
      try {
        const siteBase = 'https://www.example.com'
        const absoluteImageUrl = post.featured_image
          ? (String(post.featured_image).startsWith('http')
              ? post.featured_image
              : siteBase + String(post.featured_image))
          : null

        const articleSchema = {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': `${siteBase}/blog/${post.slug || ''}`,
          },
          headline: post.title,
          description: post.seo_description || '',
          author: { '@type': 'Person', name: 'APP' },
          publisher: {
            '@type': 'Organization',
            name: 'APP',
            logo: { '@type': 'ImageObject', url: `${siteBase}/images/favicon.jpg` },
          },
          datePublished: post.created_at,
          dateModified: post.updated_at || post.created_at,
        }

        if (absoluteImageUrl) {
          articleSchema.image = absoluteImageUrl
        }

        rich_schema = [articleSchema]
      } catch {
        rich_schema = null
      }
    }

    // Fetch related images if any
    const images = await executeBusinessQuery(
      `SELECT id, image_path, alt_text, position
       FROM blog_images
       WHERE blog_id = ?
       ORDER BY position ASC`,
      [id]
    )

    // Fetch related quotes if any
    const quotes = await executeBusinessQuery(
      `SELECT id, quote_text, author, position
       FROM blog_quotes
       WHERE blog_id = ?
       ORDER BY position ASC`,
      [id]
    )

    const payload = {
      ...post,
      seo_keywords,
      rich_schema,
      images: images || [],
      quotes: quotes || [],
      created_at: post.created_at_fmt,
      updated_at: post.updated_at_fmt,
      published_at: post.published_at_fmt,
      scheduled_publish: post.scheduled_publish_fmt,
    }

    return res.status(200).json(ApiResponse.success(payload, 'Blog post retrieved'))
  } catch (error) {
    logger.error('admin/blog/posts/get error', { error: error.message, stack: error.stack })
    return res.status(500).json(ApiResponse.error('Failed to load blog post'))
  }
}
