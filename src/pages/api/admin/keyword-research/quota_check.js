import { executeBusinessQuery } from '../../../../lib/database.js';

// Quota check using Google Custom Search JSON API
// Env vars expected:
// - GOOGLE_CSE_API_KEY
// - GOOGLE_CSE_CX
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  const log = (...args) => {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[quota_check]', ...args);
    }
  };

  try {
    const apiKey = process.env.GOOGLE_CSE_API_KEY || '';
    const cx = process.env.GOOGLE_CSE_CX || '';
    const quotaLimit = 100; // default daily limit in reference

    if (!apiKey || !cx) {
      // Keep behavior friendly: 200 with error message like PHP does for some errors
      return res.status(200).json({
        status: 'error',
        message: 'Google CSE API credentials are not configured',
        technical_details: 'Missing GOOGLE_CSE_API_KEY or GOOGLE_CSE_CX',
        quota: {
          limit: quotaLimit,
          used: 'unknown',
          remaining: 'unknown',
        },
      });
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=quota_check&num=1&prettyPrint=false`;
    log('Checking quota with URL:', url);

    // Call Google API
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'App/QuotaCheck',
      },
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      log('Failed to decode JSON:', e.message, 'Raw:', text.slice(0, 500));
      throw new Error('Invalid JSON response from Google API');
    }

    let status = 'ok';
    let message = '';
    let quotaUsed = 0;

    if (data?.error) {
      const errorCode = data.error.code || 0;
      const errorMessage = data.error.message || 'Unknown error';
      log('API error', errorCode, errorMessage);
      if (errorCode === 403 && (/daily limit/i.test(errorMessage) || /quota/i.test(errorMessage))) {
        status = 'exceeded';
        message = errorMessage;
        quotaUsed = quotaLimit;
      } else {
        throw new Error(`Google API error: ${errorMessage}`);
      }
    } else if (data?.searchInformation) {
      status = 'ok';

      // Enhanced quota tracking from DB (today's entries)
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      const rows = await executeBusinessQuery(
        'SELECT MIN(id) as first_id, MAX(id) as last_id FROM keyword_research WHERE DATE(created_at) = ?',
        [todayStr]
      );

      const firstId = rows?.[0]?.first_id ?? null;
      const lastId = rows?.[0]?.last_id ?? null;

      if (firstId != null && lastId != null) {
        quotaUsed = Number(lastId) - Number(firstId) + 1;
      } else {
        quotaUsed = 0;
      }

      // Add 1 for the current check like reference
      quotaUsed += 1;
    }

    const remaining = Math.max(0, quotaLimit - quotaUsed);

    return res.status(200).json({
      status,
      message,
      quota: {
        limit: quotaLimit,
        used: quotaUsed,
        remaining,
        usage_percentage: Math.round((quotaUsed / quotaLimit) * 1000) / 10,
      },
      api_info: {
        key: apiKey ? `${apiKey.slice(0, 10)}...` : 'n/a',
        cx: cx ? `${cx.slice(0, 8)}...` : 'n/a',
        limit_reset_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      date_info: {
        current_date: new Date().toISOString().slice(0, 10),
        reset_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      },
    });
  } catch (e) {
    return res.status(200).json({
      status: 'error',
      message: 'There was an issue checking the quota. Please try again.',
      technical_details: e.message,
      quota: { limit: 100, used: 'unknown', remaining: 'unknown' },
    });
  }
}
