import { executeBusinessQuery } from '../../../../lib/database.js';
import logger from '../../../../lib/logger.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const perPage = Math.max(1, parseInt(req.query.per_page || '10', 10));
    const offset = (page - 1) * perPage;

    const blogGeneratedRaw = req.query.blog_generated;
    const hasFilter = blogGeneratedRaw !== undefined;
    const blogGenerated = hasFilter ? parseInt(blogGeneratedRaw, 10) : null;

    // Count total
    const countSql = hasFilter
      ? 'SELECT COUNT(*) AS cnt FROM keyword_research WHERE blog_generated = ?'
      : 'SELECT COUNT(*) AS cnt FROM keyword_research';
    const countParams = hasFilter ? [blogGenerated] : [];
    const countRows = await executeBusinessQuery(countSql, countParams);
    const totalItems = countRows?.[0]?.cnt ? Number(countRows[0].cnt) : 0;
    const totalPages = Math.ceil(totalItems / perPage);

    // Fetch page with blog join for title/slug/status/published_at
    const listSql = hasFilter
      ? `SELECT 
            kr.id,
            kr.keyword,
            kr.location,
            kr.created_by,
            kr.created_at,
            kr.blog_generated,
            kr.blog_id,
            b.title AS blog_title,
            b.slug AS blog_slug,
            b.status AS blog_status,
            COALESCE(b.published_at, b.scheduled_publish) AS blog_published_at
         FROM keyword_research kr
         LEFT JOIN blog b ON b.id = kr.blog_id
         WHERE kr.blog_generated = ?
         ORDER BY kr.created_at DESC
         LIMIT ${perPage} OFFSET ${offset}`
      : `SELECT 
            kr.id,
            kr.keyword,
            kr.location,
            kr.created_by,
            kr.created_at,
            kr.blog_generated,
            kr.blog_id,
            b.title AS blog_title,
            b.slug AS blog_slug,
            b.status AS blog_status,
            COALESCE(b.published_at, b.scheduled_publish) AS blog_published_at
         FROM keyword_research kr
         LEFT JOIN blog b ON b.id = kr.blog_id
         ORDER BY kr.created_at DESC
         LIMIT ${perPage} OFFSET ${offset}`;

    const listParams = hasFilter ? [blogGenerated] : [];
    const items = await executeBusinessQuery(listSql, listParams);

    return res.status(200).json({
      status: 'success',
      data: {
        items: items || [],
        pagination: {
          total_items: totalItems,
          total_pages: totalPages,
          current_page: page,
          per_page: perPage,
        },
      },
    });
  } catch (e) {
    // Server-side logging for diagnostics
    try {
      logger.error('[KR][list] Failed to list keyword research', {
        error: e.message,
        stack: e.stack,
        query: req.query,
      });
    } catch {}
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve keyword research list',
      technical_details: e.message,
      code: 'KR_LIST_ERROR',
    });
  }
}
