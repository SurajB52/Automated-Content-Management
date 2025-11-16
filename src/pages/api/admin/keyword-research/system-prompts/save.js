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

    const {
      type,
      prompt_for,
      prompt = null,
      company_name = null,
      company_about = null,
      company_details = null,
      location = null,
      keyword_guideline = null,
    } = req.body || {}

    if (!type || !prompt_for) {
      return res.status(422).json(
        ApiResponse.validation({ type: 'required', prompt_for: 'required' })
      )
    }

    // Normalize type to match seeded records
    const rawType = String(type)
    const normalizedType = rawType === 'blog' ? 'blog_content_keyword_research' : rawType

    // Upsert based on unique (type, prompt_for)
    await executeBusinessQuery(
      `INSERT INTO system_prompts (type, prompt_for, prompt, company_name, company_about, company_details, location, keyword_guideline)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         prompt = VALUES(prompt),
         company_name = VALUES(company_name),
         company_about = VALUES(company_about),
         company_details = VALUES(company_details),
         location = VALUES(location),
         keyword_guideline = VALUES(keyword_guideline)`,
      [
        normalizedType,
        String(prompt_for),
        prompt,
        company_name,
        company_about,
        company_details,
        location,
        keyword_guideline,
      ]
    )

    return res.status(200).json(ApiResponse.success(true, 'Saved'))
  } catch (error) {
    logger.error('system-prompts/save error', { error: error.message, stack: error.stack })
    return res.status(500).json(ApiResponse.error('Failed to save system prompt'))
  }
}
