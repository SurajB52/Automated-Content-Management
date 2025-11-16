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

    const { blog_id, scheduled_publish, action = 'schedule' } = req.body || {}

    if (!blog_id) {
      return res.status(422).json(ApiResponse.validation({ blog_id: 'required' }))
    }

    // Check if blog exists
    const existing = await executeBusinessQuery(
      'SELECT id, title, status, scheduled_publish FROM blog WHERE id = ? LIMIT 1',
      [blog_id]
    )

    if (!existing || existing.length === 0) {
      return res.status(404).json(ApiResponse.notFound('Blog post not found'))
    }

    const currentPost = existing[0]

    // Handle different actions
    if (action === 'schedule') {
      // Schedule the blog post
      if (!scheduled_publish) {
        return res.status(422).json(
          ApiResponse.validation({ scheduled_publish: 'required when scheduling' })
        )
      }

      // Validate date format (should be YYYY-MM-DD HH:MM:SS or similar)
      const scheduleDate = new Date(scheduled_publish)
      if (isNaN(scheduleDate.getTime())) {
        return res.status(422).json(
          ApiResponse.validation({ scheduled_publish: 'invalid date format' })
        )
      }

      // Check if date is in the future
      const now = new Date()
      if (scheduleDate <= now) {
        return res.status(422).json(
          ApiResponse.validation({ scheduled_publish: 'must be a future date/time' })
        )
      }

      // Update blog to scheduled status
      await executeBusinessQuery(
        `UPDATE blog 
         SET status = 'scheduled', 
             scheduled_publish = ?, 
             updated_at = NOW() 
         WHERE id = ? LIMIT 1`,
        [scheduled_publish, blog_id]
      )

      // Log the scheduling action
      await executeBusinessQuery(
        `INSERT INTO blog_automation_logs (action_type, user_id, posts_affected, scheduled_time, created_at)
         VALUES ('schedule', NULL, ?, ?, NOW())`,
        [JSON.stringify([blog_id]), scheduled_publish]
      )

      logger.info('Blog post scheduled', {
        blog_id,
        scheduled_publish,
        title: currentPost.title,
      })

      return res.status(200).json(
        ApiResponse.success(
          {
            blog_id,
            status: 'scheduled',
            scheduled_publish,
          },
          'Blog post scheduled successfully'
        )
      )
    } else if (action === 'unschedule') {
      // Unschedule the blog post (revert to draft)
      await executeBusinessQuery(
        `UPDATE blog 
         SET status = 'draft', 
             scheduled_publish = NULL, 
             updated_at = NOW() 
         WHERE id = ? LIMIT 1`,
        [blog_id]
      )

      logger.info('Blog post unscheduled', { blog_id, title: currentPost.title })

      return res.status(200).json(
        ApiResponse.success(
          {
            blog_id,
            status: 'draft',
            scheduled_publish: null,
          },
          'Blog post unscheduled successfully'
        )
      )
    } else if (action === 'publish_now') {
      // Immediately publish a scheduled post
      await executeBusinessQuery(
        `UPDATE blog 
         SET status = 'published', 
             published_at = NOW(), 
             scheduled_publish = NULL, 
             updated_at = NOW() 
         WHERE id = ? LIMIT 1`,
        [blog_id]
      )

      logger.info('Scheduled blog post published immediately', {
        blog_id,
        title: currentPost.title,
      })

      return res.status(200).json(
        ApiResponse.success(
          {
            blog_id,
            status: 'published',
            published_at: new Date().toISOString(),
          },
          'Blog post published successfully'
        )
      )
    } else {
      return res.status(422).json(
        ApiResponse.validation({
          action: "must be 'schedule', 'unschedule', or 'publish_now'",
        })
      )
    }
  } catch (error) {
    logger.error('admin/blog/schedule error', { error: error.message, stack: error.stack })
    return res.status(500).json(ApiResponse.error('Failed to schedule blog post'))
  }
}
