import { executeBusinessQuery } from '../../../../lib/database.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ status: 'error', message: 'ID parameter is required' });
    }

    // Fetch main record
    const rows = await executeBusinessQuery(
      'SELECT * FROM keyword_research WHERE id = ? LIMIT 1',
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ status: 'error', message: `Keyword research with ID ${id} not found` });
    }

    const result = { ...rows[0] };

    // Parse JSON fields if present
    const parseJson = (val) => {
      if (val == null || val === '') return null;
      try { return JSON.parse(val); } catch { return null; }
    };

    result.search_results = parseJson(result.search_results);
    result.extracted_keywords = parseJson(result.extracted_keywords);

    // Enrich phrases with a computed quality_score if missing
    const computeQualityScore = (phraseObj) => {
      // Defensive defaults
      const phrase = (phraseObj && phraseObj.phrase) || '';
      const frequency = Number((phraseObj && phraseObj.frequency) || 0) || 0;
      const in_h1 = Boolean(phraseObj && phraseObj.in_h1);
      const in_h2 = Boolean(phraseObj && phraseObj.in_h2);
      const in_h3 = Boolean(phraseObj && phraseObj.in_h3);
      const h1_frequency = Number((phraseObj && phraseObj.h1_frequency) || 0) || 0;
      const h2_frequency = Number((phraseObj && phraseObj.h2_frequency) || 0) || 0;
      const hierarchy_levels = Array.isArray(phraseObj && phraseObj.hierarchy_levels)
        ? phraseObj.hierarchy_levels
        : [];

      // Start at a middle score and add bonuses similar to scripts/python_filter.py
      let score = 5.0;

      // Header presence bonuses (most important)
      if (in_h1) score += 2.5;
      if (in_h2) score += 1.5;
      if (in_h3) score += 1.0;

      // Frequency bonuses in headers
      score += Math.min(h1_frequency * 0.75, 1.5);
      score += Math.min(h2_frequency * 0.5, 1.0);

      // Hierarchy presence bonuses
      if (hierarchy_levels.length > 0) {
        // More header appearances => more points
        score += Math.min(hierarchy_levels.length * 0.5, 1.5);

        // Better average level (lower = higher headers)
        const levelSum = hierarchy_levels.reduce((s, n) => s + (Number(n) || 0), 0);
        const avgLevel = levelSum / hierarchy_levels.length;
        if (avgLevel < 2) {
          score += 0.75; // mostly h1s
        } else if (avgLevel < 3) {
          score += 0.5; // mostly h2s
        }
      }

      // Longer phrases get a small bonus
      const numWords = String(phrase).trim().split(/\s+/).filter(Boolean).length;
      if (numWords >= 3) score += 0.5;

      // Slight penalty for very common phrases
      if (frequency > 20) score -= 0.5;

      // Normalize and round
      if (score > 10) score = 10;
      if (score < 0) score = 0;
      return Math.round(score * 10) / 10; // one decimal place
    };

    if (
      result.extracted_keywords &&
      typeof result.extracted_keywords === 'object' &&
      Array.isArray(result.extracted_keywords.phrases)
    ) {
      result.extracted_keywords.phrases = result.extracted_keywords.phrases.map((p) => {
        if (p && (p.quality_score === undefined || p.quality_score === null)) {
          return { ...p, quality_score: computeQualityScore(p) };
        }
        return p;
      });
    }

    if (Object.prototype.hasOwnProperty.call(result, 'custom_keywords')) {
      result.custom_keywords = parseJson(result.custom_keywords);
    }

    // Fetch related html tags data
    const tags = await executeBusinessQuery(
      'SELECT tags_data FROM keyword_research_html WHERE keyword_research_id = ?',
      [id]
    );

    if (tags && tags.length > 0) {
      result.html_tags_data = tags.map((t) => {
        try { return JSON.parse(t.tags_data); } catch { return null; }
      }).filter(Boolean);
    } else {
      result.html_tags_data = [];
    }

    return res.status(200).json({ status: 'success', data: result });
  } catch (e) {
    return res.status(500).json({ status: 'error', message: e.message || 'Internal Server Error' });
  }
}
