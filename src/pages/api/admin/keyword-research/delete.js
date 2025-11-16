import { executeBusinessQuery } from '../../../../lib/database.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'GET') {
    // Support GET?id=... like the PHP, but prefer DELETE
    res.setHeader('Allow', ['DELETE', 'GET']);
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }
  try {
    const id = req.method === 'GET' ? req.query.id : (req.query.id || req.body?.id);
    if (!id) {
      return res.status(400).json({ status: 'error', message: 'ID parameter is required' });
    }

    // Check exists
    const existing = await executeBusinessQuery('SELECT id FROM keyword_research WHERE id = ? LIMIT 1', [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ status: 'error', message: `Record with ID ${id} not found` });
    }

    await executeBusinessQuery('DELETE FROM keyword_research WHERE id = ?', [id]);

    return res.status(200).json({ status: 'success', message: 'Record deleted successfully' });
  } catch (e) {
    return res.status(500).json({ status: 'error', message: e.message || 'Internal Server Error' });
  }
}
