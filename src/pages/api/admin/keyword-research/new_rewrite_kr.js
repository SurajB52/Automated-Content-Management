// Full port of new_rewrite_kr.php - Blog generation from keyword research
// Handles Gemini API integration, slug generation, and optional HTML fetching

import { executeBusinessQuery, getBusinessConnection } from '../../../../lib/database.js';
import { SessionHelpers, ApiResponse } from '../../../../lib/session.js';
import logger from '../../../../lib/logger.js';

// Constants
const ADMIN_COOKIE_NAME = 'app_admin_session';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Helper: Log blog generation events
function logBlogGen(message, data = {}) {
  // Only log errors to reduce file size like PHP
  if (/error|failed/i.test(message)) {
    logger.error(`[BlogGen] ${message}`, data);
  }
}

// Helper: Call Gemini API
async function callGeminiAPI(fullPrompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  const url = `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 30000,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 300000, // 5 minutes
  });

  if (!response.ok) {
    throw new Error(`Gemini API request failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// Helper: Create clean slug from text
function createCleanSlug(text) {
  const stopWords = ['a', 'an', 'the', 'in', 'on', 'at', 'for', 'to', 'of', 'with', 'and', 'or', 'but'];
  let slug = text.toLowerCase().trim();
  
  // Transliterate and clean
  slug = slug.replace(/[^\w\s-]/g, '');
  slug = slug.replace(/[^a-z0-9-]/g, '-');
  
  // Remove stop words
  const words = slug.split('-').filter(Boolean);
  const filteredWords = words.filter((w) => !stopWords.includes(w));
  
  slug = filteredWords.join('-');
  slug = slug.replace(/-+/g, '-').replace(/^-|-$/g, '');
  
  return slug;
}

// Helper: Check if slug exists in database
async function slugExists(slug, blogId) {
  try {
    const rows = await executeBusinessQuery(
      'SELECT COUNT(*) as cnt FROM blog WHERE slug = ? AND id != ?',
      [slug, blogId]
    );
    return rows?.[0]?.cnt > 0;
  } catch (e) {
    logger.error('Error checking slug existence', { error: e.message });
    return true; // Safe default
  }
}

// Helper: Extract unique meaningful words
function extractUniqueWords(text) {
  const stopWords = [
    'a', 'an', 'the', 'in', 'on', 'at', 'for', 'to', 'of', 'with', 'and', 'or',
    'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'i', 'you',
    'he', 'she', 'it', 'we', 'they', 'this', 'that', 'these', 'those'
  ];
  
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => !stopWords.includes(w) && w.length > 3);
  
  return Array.from(new Set(meaningful));
}

// Helper: Determine content type
function determineContentType(title, description) {
  const combined = `${title} ${description}`.toLowerCase();
  const types = {
    guide: ['how', 'guide', 'tips', 'advice', 'ways'],
    review: ['review', 'compare', 'versus', 'vs', 'best'],
    tutorial: ['tutorial', 'step', 'learn', 'diy', 'how-to'],
    benefits: ['benefits', 'advantages', 'why', 'reasons'],
    overview: ['overview', 'introduction', 'basics', 'fundamentals'],
    insight: ['insights', 'analysis', 'perspective', 'understanding'],
    experience: ['experience', 'journey', 'story', 'case-study'],
  };
  
  for (const [type, keywords] of Object.entries(types)) {
    for (const kw of keywords) {
      if (combined.includes(kw)) return type;
    }
  }
  
  return 'article';
}

// Helper: Generate unique SEO slug
async function generateUniqueSEOSlug(title, seoDescription, location, blogId) {
  const baseSlug = createCleanSlug(title);
  if (!(await slugExists(baseSlug, blogId))) return baseSlug;
  
  const locationSlug = `${baseSlug}-${createCleanSlug(location)}`;
  if (!(await slugExists(locationSlug, blogId))) return locationSlug;
  
  const titleWords = extractUniqueWords(title);
  const descWords = extractUniqueWords(seoDescription);
  
  for (const word of titleWords) {
    const candidate = `${locationSlug}-${word}`;
    if (!(await slugExists(candidate, blogId))) return candidate;
  }
  
  for (const word of descWords) {
    const candidate = `${locationSlug}-${word}`;
    if (!(await slugExists(candidate, blogId))) return candidate;
  }
  
  for (const tw of titleWords) {
    for (const dw of descWords) {
      const candidate = `${locationSlug}-${tw}-${dw}`;
      if (!(await slugExists(candidate, blogId))) return candidate;
    }
  }
  
  const contentType = determineContentType(title, seoDescription);
  return `${locationSlug}-${contentType}`;
}

export default async function handler(req, res) {
  let connection = null;
  
  try {
    // Admin authentication check
    const sessionId = SessionHelpers.getSessionFromCookie(req, ADMIN_COOKIE_NAME);
    if (!sessionId) {
      return res.status(401).json(ApiResponse.unauthorized('Admin authentication required'));
    }

    const authRows = await executeBusinessQuery(
      `SELECT s.admin_id FROM admin_sessions s WHERE s.session_id = ? AND s.expires_at > NOW() LIMIT 1`,
      [sessionId]
    );

    if (!authRows || authRows.length === 0) {
      return res.status(401).json(ApiResponse.unauthorized('Invalid or expired admin session'));
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Parse input
    const input = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    
    if (!Array.isArray(input.keyword_ids) || input.keyword_ids.length === 0) {
      throw new Error('Keyword IDs array is required');
    }

    const targetType = input.target_type || 'blog_content_keyword_research';
    const targetFor = input.target_for || 'customer_kr';
    const fetchTagsOnly = Boolean(input.fetch_tags_only);

    connection = await getBusinessConnection();
    await connection.beginTransaction();

    const keywordId = input.keyword_ids[0];
    logger.info('[BlogGen] Processing keyword', { keyword_id: keywordId });

    // Fetch keyword research data
    const keywordRows = await executeBusinessQuery(
      `SELECT kr.*, COALESCE(kr.location, sp.location, 'Australia') as final_location
       FROM keyword_research kr
       LEFT JOIN system_prompts sp ON sp.type = ? AND sp.prompt_for = ?
       WHERE kr.id = ?`,
      [targetType, targetFor, keywordId]
    );

    if (!keywordRows || keywordRows.length === 0) {
      throw new Error('Keyword research data not found');
    }

    const keywordData = keywordRows[0];

    // FETCH TAGS ONLY MODE - Disabled (no background HTML fetching)
    if (fetchTagsOnly) {
      logger.info('[BlogGen] HTML fetching disabled by configuration', { keyword_id: keywordId });
      return res.status(200).json({
        success: true,
        html_fetching: {
          status: 'disabled',
          message: 'HTML fetching process disabled on server',
        },
      });
    }

    // BLOG GENERATION MODE - Full Gemini flow continues below...

    // Process extracted_keywords
    let extractedKeywords = null;
    try {
      extractedKeywords = JSON.parse(keywordData.extracted_keywords || '{}');
    } catch {
      extractedKeywords = {};
    }

    if (!extractedKeywords || typeof extractedKeywords !== 'object') {
      extractedKeywords = {
        single_words: [],
        phrases: [],
        headers: { h1: [], h2: [], h3: [] },
      };
    }

    // Ensure required keys exist
    if (!Array.isArray(extractedKeywords.single_words)) extractedKeywords.single_words = [];
    if (!Array.isArray(extractedKeywords.phrases)) extractedKeywords.phrases = [];
    if (!extractedKeywords.headers || typeof extractedKeywords.headers !== 'object') {
      extractedKeywords.headers = { h1: [], h2: [], h3: [] };
    }

    // Create temporary blog entry
    const tempTitle = `Processing blog for: ${keywordData.keyword}`;
    const tempContent = JSON.stringify({
      keyword: keywordData.keyword,
      location: keywordData.final_location,
      extracted_keywords: extractedKeywords,
    });

    // Check for valid author
    const authorRows = await executeBusinessQuery('SELECT id FROM blog_authors ORDER BY id LIMIT 1');
    let authorId;
    
    if (!authorRows || authorRows.length === 0) {
      // Schema requires password (NOT NULL) and has no 'bio' column
      const defaultPassword = Math.random().toString(36).slice(2, 10);
      const createAuthorResult = await executeBusinessQuery(
        `INSERT INTO blog_authors (name, email, password, status) 
         VALUES (?, ?, ?, 'active')`,
        ['Default Author', 'info@example.com', defaultPassword]
      );
      authorId = createAuthorResult.insertId;
    } else {
      authorId = authorRows[0].id;
    }

    // Determine blog_for value
    const blogFor = targetFor === 'service_provider_kr' ? 'service_provider' : 'customer';

    // Determine target blog id: reuse existing blog if present; otherwise create a temporary one
    let blogId = keywordData.blog_id || null;
    if (!blogId) {
      const tempSlug = `${createCleanSlug(keywordData.keyword)}-${Date.now()}`;
      const blogInsertResult = await executeBusinessQuery(
        `INSERT INTO blog (title, slug, content, excerpt, author_id, status, rewrite, content_type, blog_for, featured_image_alt)
         VALUES (?, ?, ?, ?, ?, 'draft', 'processing', 'keyword_research', ?, '')`,
        [tempTitle, tempSlug, tempContent, `Processing blog for keyword: ${keywordData.keyword}`, authorId, blogFor]
      );
      blogId = blogInsertResult.insertId;
      logger.info('[BlogGen] Created temporary blog', { blog_id: blogId, keyword_id: keywordId });
    } else {
      logger.info('[BlogGen] Using existing blog for regeneration', { blog_id: blogId, keyword_id: keywordId });
    }

    // Base system message with JSON format requirements
    const baseMessage = `You are an expert blog content writer. Your task is to write a comprehensive, humanized blog post for the main keyword "${keywordData.keyword}", aimed at readers in ${keywordData.final_location}. The content should surpass the existing top-ranking articles for this keyword in terms of value, detail, user experience, and SEO optimization. Additionally, naturally incorporate the extracted keywords throughout the content.

    CRITICAL: You MUST respond with ONLY valid JSON. Do not include any text before or after the JSON. Do not use markdown code blocks. Start your response with { and end with }.

    Please provide the output in the following JSON format:
    {
        "title": "SEO-optimized blog title in 70 words limit",
        "seoTitle": "SEO-optimized title for meta",
        "seoDescription": "Compelling meta description under 160 characters",
        "seoKeywords": ["keyword1", "keyword2", "keyword3"],
        "content": "<article>Beautiful, attractive and professional HTML formatted content. Use headings (h2, h3), paragraphs, lists, and emphasize important points. Include at least 1500 words of high-quality content. Add a call to action at the end with a link to 'https://www.example.com'.</article>",
        "slug": "seo-friendly-unique-url-slug",
        "excerpt": "Brief excerpt of the content"
    }

    REMEMBER: All JSON string values must be properly escaped. Use \\" for quotes inside strings, \\n for line breaks in HTML content.`;

    // Get system prompt and company info
    const promptRows = await executeBusinessQuery(
      'SELECT prompt, location, company_name, company_details, company_about FROM system_prompts WHERE type = ? AND prompt_for = ?',
      [targetType, targetFor]
    );
    const promptData = promptRows?.[0] || null;

    // Build company info section
    let companyInfo = '';
    if (promptData && (promptData.company_name || promptData.company_details || promptData.company_about || promptData.location)) {
      companyInfo = '\n\nCompany Information:';
      if (promptData.company_name) companyInfo += `\nCompany Name: ${promptData.company_name}`;
      if (promptData.location) companyInfo += `\nLocation: ${promptData.location}`;
      if (promptData.company_details) companyInfo += `\nCompany Details: ${promptData.company_details}`;
      if (promptData.company_about) companyInfo += `\nAbout Company: ${promptData.company_about}`;
      companyInfo += '\n\nPlease ensure the content aligns with the company\'s identity, location context, and incorporates relevant company information where appropriate. Use the provided location details to make the content more relevant to the target audience.';
    }

    // Prepare keywords and phrases for prompt (limit to 150 total)
    const maxTotalKeywords = 150;
    let allPhrases = extractedKeywords.phrases || [];
    let allWords = extractedKeywords.single_words || [];
    const totalKeywords = allPhrases.length + allWords.length;

    if (totalKeywords > maxTotalKeywords) {
      const ratio = allPhrases.length / (totalKeywords || 1);
      const maxPhrases = Math.floor(maxTotalKeywords * ratio);
      const maxWords = maxTotalKeywords - maxPhrases;
      allPhrases = allPhrases.slice(0, maxPhrases);
      allWords = allWords.slice(0, maxWords);
      logBlogGen('Limited keywords due to large quantity', {
        keyword_id: keywordId,
        original_phrase_count: extractedKeywords.phrases.length,
        original_word_count: extractedKeywords.single_words.length,
        limited_phrase_count: allPhrases.length,
        limited_word_count: allWords.length,
      });
    }

    // Format phrases for prompt
    let phrasesForPrompt = '\n\nAll phrases from keyword research:';
    allPhrases.forEach((phrase, idx) => {
      const text = typeof phrase === 'object' ? phrase.phrase : phrase;
      phrasesForPrompt += `\n${idx + 1}. ${text}`;
    });

    // Format words for prompt
    let wordsForPrompt = '\n\nAll single words from keyword research:';
    allWords.forEach((word, idx) => {
      const text = Array.isArray(word) ? word[0] : word;
      wordsForPrompt += `\n${idx + 1}. ${text}`;
    });

    // Build target audience info
    const targetAudienceInfo = targetFor === 'customer_kr'
      ? '\n\nTarget Audience: This content is aimed at customers and should be written in a clear, engaging, and accessible manner.'
      : '\n\nTarget Audience: This content is aimed at service providers and should maintain a professional tone while demonstrating industry expertise.';

    // Get search results
    let searchResultsData = [];
    try {
      const parsed = JSON.parse(keywordData.search_results || '[]');
      searchResultsData = Array.isArray(parsed.results) ? parsed.results : (Array.isArray(parsed) ? parsed : []);
    } catch {
      searchResultsData = [];
    }

    // Build articles text from search results
    let articlesText = '';
    let articlesUsed = 0;
    if (searchResultsData && searchResultsData.length > 0) {
      articlesText = '\n\nReference Articles:\n';
      searchResultsData.forEach((article, i) => {
        const num = i + 1;
        let content = '';
        let contentSource = '';

        if (article.main_text) {
          content = article.main_text;
          contentSource = 'main_text';
        } else if (article.content) {
          content = article.content;
          contentSource = 'content';
        } else if (article.snippet) {
          content = article.snippet;
          contentSource = 'snippet';
        } else if (article.description) {
          content = article.description;
          contentSource = 'description';
        }

        if (content) {
          const contentLength = contentSource === 'main_text' ? 5000 : 2000;
          const truncated = content.substring(0, contentLength);
          if (truncated.trim().length >= 50) {
            articlesText += `\nArticle ${num}: ${article.title}\nURL: ${article.url}\nContent (${contentSource}): ${truncated}\n`;
            articlesUsed++;
          }
        }
      });
    }

    // Fallback if no articles
    if (articlesUsed === 0) {
      logger.warn('[BlogGen] No articles with usable content, creating context from keyword data', { keyword_id: keywordId });
      articlesText = '\n\nKeyword Research Context:\n';
      articlesText += `Primary keyword: ${keywordData.keyword}\n`;
      articlesText += `Target location: ${keywordData.final_location}\n`;
      if (allPhrases.length > 0) {
        const topPhrases = allPhrases.slice(0, 10).map((p) => (typeof p === 'object' ? p.phrase : p));
        articlesText += `Related phrases: ${topPhrases.join(', ')}\n`;
      }
      if (allWords.length > 0) {
        const topWords = allWords.slice(0, 15).map((w) => (Array.isArray(w) ? w[0] : w));
        articlesText += `Important terms: ${topWords.join(', ')}\n`;
      }
      articlesText += '\nPlease create comprehensive content based on your knowledge of this topic and the provided keywords.\n';
    }

    // Build keyword context
    let keywordContext = '\n\nKeyword Research Data:\n';
    keywordContext += `Main Keyword: ${keywordData.keyword}\n`;
    keywordContext += `Location: ${keywordData.final_location}\n`;
    if (allPhrases.length > 0) {
      const phrases20 = allPhrases.slice(0, 20).map((p) => (typeof p === 'object' ? p.phrase : p));
      keywordContext += `Key Phrases: ${phrases20.join(', ')}\n`;
    }
    if (allWords.length > 0) {
      const words30 = allWords.slice(0, 30).map((w) => (Array.isArray(w) ? w[0] : w));
      keywordContext += `Important Words: ${words30.join(', ')}\n`;
    }

    // Build final prompt
    let fullPrompt = baseMessage;
    // Move keyword context and extracted keywords immediately after base message
    fullPrompt += keywordContext;
    fullPrompt += phrasesForPrompt + wordsForPrompt;
    // Then add reference articles/context
    fullPrompt += articlesText;
    // Then audience and company information
    fullPrompt += targetAudienceInfo;
    fullPrompt += companyInfo;

    // Add system prompt guidelines if available
    if (promptData && promptData.prompt) {
      // Keep guidelines at the very end
      fullPrompt += '\n\nGuidelines:\n' + promptData.prompt;
    } else {
      fullPrompt += `\n\nGuidelines:
1. Your content should be focused on readers in ${keywordData.final_location} but also mention other Australian cities as appropriate.
2. The primary keyword "${keywordData.keyword}" should appear in the title, first paragraph, and be used naturally throughout the content.
3. I've provided a comprehensive list of phrases and single words from keyword research. Try to incorporate as many of these as possible throughout the article, but maintain natural flow and readability.
4. Prioritize the most relevant keywords and phrases that fit naturally within the content.
5. Create content that is valuable, informative, and surpasses existing articles on this topic.
6. The blog should have a clear structure with introduction, main sections, and conclusion.
7. Use a conversational, human tone avoiding complex language.
8. Focus on creating content that is helpful for Australian readers specifically.`;
    }

    // Call Gemini API
    logger.info('[BlogGen] Calling Gemini API', { keyword_id: keywordId, prompt_length: fullPrompt.length });
    const geminiResponse = await callGeminiAPI(fullPrompt);

    if (!geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
      logBlogGen('Empty Gemini response', { keyword_id: keywordId, full_response: geminiResponse });
      throw new Error('Empty response from Gemini API');
    }

    let responseText = geminiResponse.candidates[0].content.parts[0].text.trim();

    // BULLETPROOF JSON EXTRACTION - Multiple strategies
    responseText = responseText.replace(/^```(?:json)?\s*/gm, '').replace(/\s*```$/gm, '');

    let blogData = null;
    let extractionMethod = '';

    // Strategy 1: Direct JSON decode
    try {
      blogData = JSON.parse(responseText);
      extractionMethod = 'direct';
    } catch {
      // Strategy 2: Extract JSON between first { and last }
      const start = responseText.indexOf('{');
      const end = responseText.lastIndexOf('}');

      if (start !== -1 && end !== -1 && end > start) {
        let jsonPart = responseText.substring(start, end + 1);

        try {
          blogData = JSON.parse(jsonPart);
          extractionMethod = 'bracket_extraction';
        } catch {
          // Strategy 3: Fix incomplete JSON by adding missing closing braces
          const openBraces = (jsonPart.match(/{/g) || []).length;
          const closeBraces = (jsonPart.match(/}/g) || []).length;

          if (openBraces > closeBraces) {
            const fixedJson = jsonPart + '}'.repeat(openBraces - closeBraces);
            try {
              blogData = JSON.parse(fixedJson);
              extractionMethod = 'brace_fix';
            } catch {}
          }

          // Strategy 4: Fix quotes and braces
          if (!blogData) {
            const openQuotes = (jsonPart.match(/"/g) || []).length % 2;
            let fixedJson = jsonPart;
            if (openQuotes === 1) fixedJson += '"';

            const ob2 = (fixedJson.match(/{/g) || []).length;
            const cb2 = (fixedJson.match(/}/g) || []).length;
            if (ob2 > cb2) fixedJson += '}'.repeat(ob2 - cb2);

            try {
              blogData = JSON.parse(fixedJson);
              extractionMethod = 'quote_and_brace_fix';
            } catch {}
          }

          // Strategy 5: Manual field extraction
          if (!blogData) {
            blogData = {};
            const titleMatch = responseText.match(/"title"\s*:\s*"([^"]*)"/);
            if (titleMatch) blogData.title = titleMatch[1];
            const seoTitleMatch = responseText.match(/"seoTitle"\s*:\s*"([^"]*)"/);
            if (seoTitleMatch) blogData.seoTitle = seoTitleMatch[1];
            const seoDescMatch = responseText.match(/"seoDescription"\s*:\s*"([^"]*)"/);
            if (seoDescMatch) blogData.seoDescription = seoDescMatch[1];
            const excerptMatch = responseText.match(/"excerpt"\s*:\s*"([^"]*)"/);
            if (excerptMatch) blogData.excerpt = excerptMatch[1];
            const contentMatch = responseText.match(/"content"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
            if (contentMatch) blogData.content = contentMatch[1];

            if (Object.keys(blogData).length > 0) {
              extractionMethod = 'manual_field_extraction';
            }
          }
        }
      }

    // Fallback generation
      if (!blogData || Object.keys(blogData).length === 0) {
        logBlogGen('All JSON extraction strategies failed, creating minimal fallback', {
          keyword_id: keywordId,
          response_length: responseText.length,
        });

        blogData = {
          title: `${keywordData.keyword.replace(/[-_]/g, ' ')} - Complete Guide`,
        seoTitle: `${keywordData.keyword.replace(/[-_]/g, ' ')} Guide`,
        seoDescription: `Complete guide to ${keywordData.keyword} in ${keywordData.final_location}.`,
          seoKeywords: [keywordData.keyword],
          excerpt: `Complete guide to ${keywordData.keyword} in Australia.`,
          content: '',
        };
        extractionMethod = 'fallback_generation';
      }
    }

    logger.info('[BlogGen] JSON extraction successful', { method: extractionMethod });

    // Handle content vs html field
    if (!blogData.content && blogData.html) {
      blogData.content = blogData.html;
    }

    // BULLETPROOF FIELD GENERATION - Generate missing fields
    if (!blogData.title || !blogData.title.trim()) {
      blogData.title = `${keywordData.keyword.replace(/[-_]/g, ' ')} - Complete Guide`;
    }

    if (!blogData.seoTitle || !blogData.seoTitle.trim()) {
      blogData.seoTitle = blogData.title;
    }

    if (!blogData.seoDescription || !blogData.seoDescription.trim()) {
      blogData.seoDescription = `Complete guide to ${keywordData.keyword} in ${keywordData.final_location}. Get expert advice and quotes from trusted professionals.`;
      if (blogData.seoDescription.length > 160) {
        blogData.seoDescription = blogData.seoDescription.substring(0, 157) + '...';
      }
    }

    if (!Array.isArray(blogData.seoKeywords) || blogData.seoKeywords.length === 0) {
      blogData.seoKeywords = [
        keywordData.keyword,
        `${keywordData.keyword} ${keywordData.final_location}`,
      ];
    }

    if (!blogData.excerpt || !blogData.excerpt.trim()) {
      blogData.excerpt = blogData.seoDescription;
    }

    if (!blogData.content || !blogData.content.trim()) {
      blogData.content = `<article><h1>${blogData.title}</h1>`;
      blogData.content += `<p>This comprehensive guide covers everything you need to know about ${keywordData.keyword} in Australia.</p>`;
      blogData.content += `<h2>What You Need to Know</h2>`;
      blogData.content += `<p>Finding the right solution for ${keywordData.keyword} can be challenging. Our platform connects you with trusted local professionals who can help.</p>`;
      blogData.content += `<h2>Get Professional Help</h2>`;
      blogData.content += `<p>Don't tackle this alone. Get up to 3 quotes from verified professionals in your area.</p>`;
      blogData.content += `<p><strong><a href='https://example.com' style='background: #007cba; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;'>Get Your Free Quotes Now!</a></strong></p>`;
      blogData.content += `</article>`;
      logBlogGen('Generated fallback content due to missing content field', { keyword_id: keywordId });
    }

    // Sanitize excessive newline and spacing artifacts from model output
    const sanitizePlain = (text) => {
      if (typeof text !== 'string') return text;
      return text
        .replace(/\r/g, '')             // remove carriage returns
        .replace(/\n+/g, ' ')           // collapse all newlines into single spaces
        .replace(/\s{2,}/g, ' ')        // collapse repeated spaces
        .trim();
    };
    const sanitizeHtml = (html) => {
      if (typeof html !== 'string') return html;
      return html
        .replace(/\r/g, '')
        .replace(/\n+/g, '')           // remove newlines entirely inside HTML
        .replace(/>\s+</g, '><')       // remove whitespace between tags
        .replace(/\s{2,}/g, ' ')       // collapse runs of spaces
        .trim();
    };

    blogData.title = sanitizePlain(blogData.title);
    blogData.seoTitle = sanitizePlain(blogData.seoTitle);
    blogData.seoDescription = sanitizePlain(blogData.seoDescription);
    blogData.excerpt = sanitizePlain(blogData.excerpt);
    blogData.content = sanitizeHtml(blogData.content);

    // Determine final slug from model output or fallback to title; ensure uniqueness
    let finalSlug = null;
    let slugSource = 'title_fallback';
    try {
      const fromModel = (blogData.slug && typeof blogData.slug === 'string') ? blogData.slug : '';
      const baseSlugFromModel = fromModel ? createCleanSlug(fromModel) : '';
      const baseSlugFromTitle = createCleanSlug(blogData.title || keywordData.keyword);
      const baseCandidate = baseSlugFromModel || baseSlugFromTitle;
      if (baseSlugFromModel) slugSource = 'model';
      finalSlug = await generateUniqueSEOSlug(blogData.title || keywordData.keyword, blogData.seoDescription || '', keywordData.final_location, blogId);
      // If generateUniqueSEOSlug somehow fails, fallback to baseCandidate
      if (!finalSlug || !finalSlug.trim()) finalSlug = baseCandidate;
    } catch {
      finalSlug = createCleanSlug(blogData.title || keywordData.keyword);
    }
    logger.info('[BlogGen] Slug resolved', { keyword_id: keywordId, blog_id: blogId, source: slugSource, slug: finalSlug });

    // Validate all required fields exist
    const requiredFields = ['title', 'seoTitle', 'seoDescription', 'seoKeywords', 'slug', 'excerpt', 'content'];
    const missingFields = requiredFields.filter((field) => {
      const val = blogData[field];
      return !val || (typeof val === 'string' && !val.trim());
    });

    if (missingFields.length > 0) {
      logBlogGen('CRITICAL: Still missing required fields after generation', {
        keyword_id: keywordId,
        missing_fields: missingFields,
      });
      throw new Error(`Critical error: Missing required fields after generation: ${missingFields.join(', ')}`);
    }

    logger.info('[BlogGen] All required fields validated successfully');

    // Update blog with generated content and final slug
    await executeBusinessQuery(
      `UPDATE blog 
       SET title = ?, slug = ?, content = ?, excerpt = ?, seo_title = ?, seo_description = ?, 
           seo_keywords = ?, rewrite = 'completed', status = 'draft', content_type = 'content', 
           blog_for = ?, featured_image_alt = ?
       WHERE id = ?`,
      [
        blogData.title,
        finalSlug,
        blogData.content,
        blogData.seoTitle,
        blogData.seoTitle,
        blogData.seoDescription,
        JSON.stringify(blogData.seoKeywords),
        blogFor,
        blogData.title || '',
        blogId,
      ]
    );

    // Mark keyword_research as blog_generated
    await executeBusinessQuery(
      'UPDATE keyword_research SET blog_generated = 1, blog_id = ? WHERE id = ?',
      [blogId, keywordId]
    );

    // Commit transaction with retry logic
    try {
      if (connection) {
        await connection.commit();
        connection.release();
        connection = null;
      }
      logger.info('[BlogGen] Blog generation completed successfully', { blog_id: blogId, keyword_id: keywordId });
    } catch (commitError) {
      logger.error('[BlogGen] Error during commit, retrying', { error: commitError.message });
      
      // Retry once
      const newConn = await getBusinessConnection();
      await newConn.beginTransaction();
      
      await executeBusinessQuery(
        `UPDATE blog 
         SET title = ?, slug = ?, content = ?, excerpt = ?, seo_title = ?, seo_description = ?, 
             seo_keywords = ?, rewrite = 'completed', status = 'draft', content_type = 'content', 
             blog_for = ?, featured_image_alt = ?
         WHERE id = ?`,
        [
          blogData.title,
          finalSlug,
          blogData.content,
          blogData.seoTitle,
          blogData.seoTitle,
          blogData.seoDescription,
          JSON.stringify(blogData.seoKeywords),
          blogFor,
          blogData.title || '',
          blogId,
        ]
      );

      await executeBusinessQuery(
        'UPDATE keyword_research SET blog_generated = 1, blog_id = ? WHERE id = ?',
        [blogId, keywordId]
      );

      await newConn.commit();
      newConn.release();
      logger.info('[BlogGen] Blog generation completed after retry', { blog_id: blogId, keyword_id: keywordId });
    }

    // Format successful response
    const formattedResponse = {
      success: true,
      data: {
        blog_id: blogId,
        keyword_id: keywordId,
        title: blogData.title,
        seoTitle: blogData.seoTitle,
        seoDescription: blogData.seoDescription,
        seoKeywords: blogData.seoKeywords,
        content: blogData.content,
        slug: blogData.slug,
        excerpt: blogData.seoTitle,
        model: 'gemini-pro',
        processing_stage: 'finished',
        progress: 100,
      },
    };

    return res.status(200).json(formattedResponse);

  } catch (e) {
    // Rollback transaction on error
    if (connection) {
      try {
        await connection.rollback();
        connection.release();
      } catch (rollbackError) {
        logger.error('[BlogGen] Error during rollback', { error: rollbackError.message });
      }
    }

    logBlogGen('Blog generation failed', {
      error: e.message,
      keyword_id: input?.keyword_ids?.[0] || 'unknown',
      stack: e.stack,
    });

    return res.status(500).json({
      success: false,
      error: e.message || 'Blog generation failed',
    });
  }
}
