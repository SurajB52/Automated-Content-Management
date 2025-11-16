import { executeBusinessQuery } from '../../../../lib/database.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, statusCode: 405, message: 'Invalid request method. Only POST is allowed.' });
  }

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const { id, custom_keywords } = data;
    if (!id) {
      return res.status(400).json({ success: false, statusCode: 400, message: 'Missing required parameter: id' });
    }
    // Accept object shape { single_words: string[], phrases: string[] } or a raw array
    if (!custom_keywords || (typeof custom_keywords !== 'object' && !Array.isArray(custom_keywords))) {
      return res.status(400).json({ success: false, statusCode: 400, message: 'Missing or invalid parameter: custom_keywords' });
    }

    // Normalize to { single_words: string[], phrases: string[] }
    let normalized;
    if (Array.isArray(custom_keywords)) {
      normalized = { single_words: custom_keywords, phrases: [] };
    } else {
      const single = Array.isArray(custom_keywords.single_words) ? custom_keywords.single_words : [];
      const phrases = Array.isArray(custom_keywords.phrases) ? custom_keywords.phrases : [];
      normalized = { single_words: single, phrases };
    }

    const customKeywordsJson = JSON.stringify(normalized);

    const result = await executeBusinessQuery(
      'UPDATE keyword_research SET custom_keywords = ? WHERE id = ?',[customKeywordsJson, id]
    );

    if (result && result.affectedRows > 0) {
      return res.status(200).json({ success: true, statusCode: 200, message: 'Custom keywords saved successfully' });
    }
    return res.status(500).json({ success: false, statusCode: 500, message: 'Failed to update custom keywords in database' });
  } catch (e) {
    return res.status(500).json({ success: false, statusCode: 500, message: `Failed to save custom keywords: ${e.message}` });
  }
}
