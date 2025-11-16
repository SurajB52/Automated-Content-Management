import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { ApiResponse } from '@/lib/session.js'
import { requireAdminAuth } from '@/lib/adminAuth.js'
import logger from '@/lib/logger.js'
import { executeBusinessQuery } from '@/lib/database.js'

// Configure multer for blog gallery uploads (align with site photo approach)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      const uploadsRoot = (process.env.UPLOADS_ABS_ROOT && path.isAbsolute(process.env.UPLOADS_ABS_ROOT))
        ? process.env.UPLOADS_ABS_ROOT
        : path.join(process.cwd(), 'public', 'uploads')
      const uploadDir = path.join(uploadsRoot, 'blog', 'gallery')
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }
      cb(null, uploadDir)
    } catch (e) {
      logger.error('Multer destination error for blog gallery', { error: e.message })
      cb(e)
    }
  },
  filename: function (req, file, cb) {
    try {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
      cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase())
    } catch (e) {
      logger.error('Multer filename error for blog gallery', { error: e.message })
      cb(e)
    }
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per image
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)
    if (mimetype && extname) {
      return cb(null, true)
    } else {
      return cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'))
    }
  }
})

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  const admin = await requireAdminAuth(req, res)
  if (!admin) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json(ApiResponse.error('Method not allowed', 405))
  }

  try {
    logger.info('Blog gallery upload request received', {
      adminId: admin.id,
      method: req.method,
      contentType: req.headers['content-type']
    })

    await new Promise((resolve) => {
      upload.any()(req, res, async (err) => {
        logger.info('Multer callback entered for blog gallery upload')
        if (err) {
          logger.error('Blog gallery upload error', { error: err.message })
          return resolve(res.status(400).json(ApiResponse.error(err.message)))
        }

        // Enforce max 20 files even when accepting any field names
        const files = Array.isArray(req.files) ? req.files.slice(0, 20) : []

        logger.info('Multer parsed files for blog gallery upload', {
          count: Array.isArray(req.files) ? req.files.length : 0,
          usedCount: files.length,
          fields: req.body ? Object.keys(req.body) : []
        })

        if (!files || files.length === 0) {
          return resolve(res.status(400).json(ApiResponse.error('No images uploaded')))
        }

        try {
          const uploadedImages = []

          for (const file of files) {
            const relativeUrl = `/uploads/blog/gallery/${file.filename}`

            const result = await executeBusinessQuery(
              `INSERT INTO blog_gallery_images (url, alt, created_at) 
               VALUES (?, ?, NOW())`,
              [relativeUrl, file.originalname || 'Image']
            )

            uploadedImages.push({
              id: result.insertId,
              url: relativeUrl,
              alt: file.originalname || 'Image',
              created_at: new Date().toISOString()
            })
          }

          logger.info('Blog gallery images uploaded', { adminId: admin.id, count: uploadedImages.length })

          return resolve(res.status(200).json(
            ApiResponse.success(
              uploadedImages,
              `${uploadedImages.length} image(s) uploaded successfully`
            )
          ))
        } catch (e) {
          // Clean up any uploaded files on error
          if (files) {
            files.forEach(f => {
              if (fs.existsSync(f.path)) {
                try { fs.unlinkSync(f.path) } catch {}
              }
            })
          }
          logger.error('Blog gallery upload failed during processing', { error: e.message, stack: e.stack })
          return resolve(res.status(500).json(ApiResponse.error('Failed to upload images')))
        }
      })
    })
  } catch (error) {
    logger.error('Blog gallery upload failed', { error: error.message, stack: error.stack })
    return res.status(500).json(ApiResponse.error(`Upload failed: ${error.message}`))
  }
}
