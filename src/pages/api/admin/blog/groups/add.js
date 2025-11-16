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

    const { name } = req.body

    // Validate input
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json(
        ApiResponse.error('Blog group name is required')
      )
    }

    const trimmedName = name.trim()

    // Check if group name already exists (case-insensitive)
    const checkQuery = 'SELECT id FROM blog_groups WHERE LOWER(name) = LOWER(?)'
    const existing = await executeBusinessQuery(checkQuery, [trimmedName])

    if (existing && existing.length > 0) {
      return res.status(409).json(
        ApiResponse.error('A blog group with this name already exists')
      )
    }

    // Insert new blog group
    const insertQuery = 'INSERT INTO blog_groups (name) VALUES (?)'
    const result = await executeBusinessQuery(insertQuery, [trimmedName])

    if (!result || !result.insertId) {
      throw new Error('Failed to insert blog group')
    }

    // Get the newly created group
    const getQuery = `
      SELECT 
        id,
        name,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
      FROM blog_groups
      WHERE id = ?
    `
    const newGroup = await executeBusinessQuery(getQuery, [result.insertId])

    if (!newGroup || newGroup.length === 0) {
      throw new Error('Failed to retrieve newly created blog group')
    }

    return res.status(201).json(
      ApiResponse.success(newGroup[0], 'Blog group created successfully')
    )
  } catch (error) {
    logger.error('admin/blog/groups/add error', { 
      error: error.message, 
      stack: error.stack 
    })
    return res.status(500).json(
      ApiResponse.error('Failed to create blog group')
    )
  }
}
