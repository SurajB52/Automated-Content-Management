import { executeBusinessQuery } from '../../../../lib/database.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { id, blog_generated } = body;

    if (!id) {
      return res.status(400).json({ status: 'error', message: 'ID is required' });
    }
    if (blog_generated === undefined || blog_generated === null) {
      return res.status(400).json({ status: 'error', message: 'blog_generated status is required' });
    }

    const blogGeneratedInt = parseInt(blog_generated, 10);
    if (![0, 1].includes(blogGeneratedInt)) {
      return res.status(400).json({ status: 'error', message: 'blog_generated must be 0 or 1' });
    }

    // Check exists
    const check = await executeBusinessQuery('SELECT id FROM keyword_research WHERE id = ? LIMIT 1', [id]);
    if (!check || check.length === 0) {
      return res.status(404).json({ status: 'error', message: `Record with ID ${id} not found` });
    }

    await executeBusinessQuery(
      'UPDATE keyword_research SET blog_generated = ? WHERE id = ?',
      [blogGeneratedInt, id]
    );

    return res.status(200).json({
      status: 'success',
      message: 'Record updated successfully',
      data: { id, blog_generated: blogGeneratedInt },
    });
  } catch (e) {
    return res.status(500).json({ status: 'error', message: e.message || 'Internal Server Error' });
  }
}
