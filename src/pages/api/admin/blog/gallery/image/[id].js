import fs from 'fs'
import path from 'path'
import { requireAdminAuth } from '@/lib/adminAuth.js'
import logger from '@/lib/logger.js'
import { executeBusinessQuery } from '@/lib/database.js'

function getMimeTypeByExt(ext) {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

function resolveUploadAbsPath(relativeUrl) {
  // relativeUrl is like '/uploads/blog/gallery/xxx.jpg'
  const trimmed = relativeUrl.replace(/^\//, '')
  // If UPLOADS_ABS_ROOT is absolute, use it as root and append after '/uploads/'
  if (process.env.UPLOADS_ABS_ROOT && path.isAbsolute(process.env.UPLOADS_ABS_ROOT)) {
    const withoutPrefix = trimmed.replace(/^uploads\//, '')
    return path.join(process.env.UPLOADS_ABS_ROOT, withoutPrefix)
  }
  // Fallback to project public/uploads
  return path.join(process.cwd(), 'public', trimmed)
}

export default async function handler(req, res) {
  const admin = await requireAdminAuth(req, res)
  if (!admin) return

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).end('Method Not Allowed')
    return
  }

  try {
    const { id } = req.query
    if (!id) {
      res.status(400).end('Image id is required')
      return
    }

    const rows = await executeBusinessQuery(
      'SELECT id, url, alt FROM blog_gallery_images WHERE id = ? LIMIT 1',
      [id]
    )

    if (!rows || rows.length === 0) {
      res.status(404).end('Image not found')
      return
    }

    const record = rows[0]
    const absPath = resolveUploadAbsPath(record.url || '')

    if (!absPath || !fs.existsSync(absPath)) {
      logger.warn('Blog gallery image file missing', { id, url: record.url, absPath })
      res.status(404).end('Image file not found')
      return
    }

    const ext = path.extname(absPath)
    const mime = getMimeTypeByExt(ext)

    res.setHeader('Content-Type', mime)
    // Optional: caching headers
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

    const stat = fs.statSync(absPath)
    res.setHeader('Content-Length', stat.size)

    const stream = fs.createReadStream(absPath)
    stream.on('error', (err) => {
      logger.error('Error streaming blog gallery image', { id, error: err.message })
      if (!res.headersSent) res.status(500)
      res.end('Failed to read image')
    })
    stream.pipe(res)
  } catch (error) {
    logger.error('Blog gallery image handler failed', { error: error.message })
    if (!res.headersSent) res.status(500)
    res.end('Internal server error')
  }
}
