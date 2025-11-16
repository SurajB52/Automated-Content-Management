import { executeBusinessQuery } from '../../../../lib/database.js';
import logger from '../../../../lib/logger.js';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const log = (...args) => {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[python_search]', ...args);
  }
};

async function runPythonScript(pythonPath, scriptPath, inputJson) {
  // Create temp files for stdin/stdout/stderr compatibility similar to PHP
  const tmpDir = os.tmpdir();
  const inputFile = path.join(tmpDir, `py_in_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  const outputFile = path.join(tmpDir, `py_out_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  const errorFile = path.join(tmpDir, `py_err_${Date.now()}_${Math.random().toString(36).slice(2)}.log`);

  try {
    await fs.writeFile(inputFile, JSON.stringify(inputJson));

    // We'll spawn the python process and redirect using shell features per-platform
    const shellCmd = process.platform === 'win32'
      ? `${pythonPath} "${scriptPath}" < "${inputFile}" > "${outputFile}" 2> "${errorFile}"`
      : `${pythonPath} "${scriptPath}" < "${inputFile}" > "${outputFile}" 2> "${errorFile}"`;

    log('Executing:', shellCmd);

    await new Promise((resolve, reject) => {
      const child = spawn(shellCmd, { shell: true, stdio: 'inherit' });
      child.on('error', reject);
      child.on('exit', async (code) => {
        if (code === 0) return resolve();
        // Try to include stderr for diagnostics
        let stderrTxt = '';
        try { stderrTxt = await fs.readFile(errorFile, 'utf8'); } catch {}
        const first = stderrTxt ? stderrTxt.slice(0, 800) : '';
        reject(new Error(`Python exited with code ${code}${first ? ` | stderr: ${first}` : ''}`));
      });
    });

    const rawOutput = await fs.readFile(outputFile, 'utf8');
    let json;
    try {
      json = JSON.parse(rawOutput);
    } catch (e) {
      const errTxt = await fs.readFile(errorFile, 'utf8').catch(() => '');
      log('Failed parsing JSON. First 500 output chars:', rawOutput.slice(0, 500));
      throw new Error(`Failed to parse Python output: ${e.message} ${errTxt ? `| Python err: ${errTxt.slice(0, 500)}` : ''}`);
    }
    return json;
  } finally {
    // Best-effort cleanup
    try { await fs.unlink(inputFile); } catch {}
    try { await fs.unlink(outputFile); } catch {}
    try { await fs.unlink(errorFile); } catch {}
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ status: 'error', message: 'Invalid request method. Only POST is allowed.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const keyword = body.keyword;
    if (!keyword || typeof keyword !== 'string') {
      throw new Error('Keyword is required');
    }

    const location = body.location || 'Australia';
    const searchEngine = body.search_engine || 'google.com.au';
    const createdBy = body.created_by || 'System';

    const pythonInput = {
      keyword,
      location,
      search_engine: searchEngine,
    };
    if (body.use_gemini_enhancement) pythonInput.use_gemini_enhancement = true;
    if (body.company_info) pythonInput.company_info = body.company_info;

    // Resolve python binary and script path
    // Prefer local virtualenv if present
    let PYTHON_BIN = process.env.KR_PYTHON || process.env.PYTHON_BIN || null;
    if (!PYTHON_BIN) {
      const venvCandidates = [
        path.join(process.cwd(), '.venv', 'bin', 'python'),
        path.join(process.cwd(), 'venv', 'bin', 'python'),
      ];
      for (const cand of venvCandidates) {
        try { await fs.access(cand); PYTHON_BIN = cand; break; } catch {}
      }
      if (!PYTHON_BIN) PYTHON_BIN = 'python3';
    }
    // Allow explicit override of script path via env
    let scriptPath = process.env.KR_PY_SCRIPT || null;
    if (scriptPath) {
      try {
        await fs.access(scriptPath);
      } catch {
        // Log and fall back to default candidates
        logger.warn('[python_search] KR_PY_SCRIPT not found, falling back to default candidates', { scriptPath });
        scriptPath = null;
      }
    }

    if (!scriptPath) {
      // Prefer project scripts/keyword_search.py; fallback to Doc reference path if needed
      const scriptCandidates = [
        path.join(process.cwd(), 'scripts', 'keyword_search.py'),
        path.join(process.cwd(), 'Doc', 'Reference', 'admin_api', 'keyword_research', 'keyword_search.py'),
      ];
      for (const cand of scriptCandidates) {
        try { await fs.access(cand); scriptPath = cand; break; } catch {}
      }
      if (!scriptPath) {
        throw new Error('Python script not found. Expected at scripts/keyword_search.py or KR_PY_SCRIPT');
      }
    }

    logger.info('[python_search] Executing Python script', { python: PYTHON_BIN, scriptPath });
    const pyResult = await runPythonScript(PYTHON_BIN, scriptPath, pythonInput);

    if (pyResult?.status === 'error') {
      throw new Error(`Python script returned an error: ${pyResult.message || 'Unknown error'}`);
    }

    // Extract fields similar to PHP implementation
    const searchResults = Array.isArray(pyResult.results) ? pyResult.results : [];
    // Ensure non-scrapable results don't carry main_text to reduce payload, like PHP
    const reducedResults = searchResults.map((r) => {
      const obj = { ...(r || {}) };
      if (!obj.scrapable) delete obj.main_text;
      if (typeof obj.snippet === 'string' && obj.snippet.length > 300) {
        obj.snippet = `${obj.snippet.slice(0, 300)}...`;
      }
      return obj;
    });

    const headerAnalysis = pyResult.header_analysis || { h1: [], h2: [], h3: [] };
    const keywordAnalysis = pyResult.keyword_analysis || { single_words: [], phrases: [] };

    // Ensure required keys
    const extractedKeywords = {
      single_words: Array.isArray(keywordAnalysis.single_words) ? keywordAnalysis.single_words : [],
      phrases: Array.isArray(keywordAnalysis.phrases) ? keywordAnalysis.phrases : [],
      headers: headerAnalysis || { h1: [], h2: [], h3: [] },
    };

    // Store in DB
    const searchResultsJson = JSON.stringify(reducedResults);
    const extractedKeywordsJson = JSON.stringify(extractedKeywords);

    const insertSql = `INSERT INTO keyword_research (keyword, location, search_results, extracted_keywords, created_by, blog_generated)
                       VALUES (?, ?, ?, ?, ?, 0)`;

    const result = await executeBusinessQuery(insertSql, [
      keyword,
      location,
      searchResultsJson,
      extractedKeywordsJson,
      createdBy,
    ]);

    const id = result?.insertId;

    const response = { status: 'success', id };

    if (req.headers['x-debug'] === '1') {
      response.query = `${keyword} ${location}`;
      response.search_engine = searchEngine;
      response.results = reducedResults;
      response.total_results = pyResult.total_results || '0';
      response.search_time = pyResult.search_time || 0;
      response.keyword_analysis = extractedKeywords;
    }

    return res.status(200).json(response);
  } catch (e) {
    // Server-side logging for diagnostics
    try {
      logger.error('[python_search] Keyword research failed', { error: e.message, stack: e.stack });
    } catch {}
    // Provide helpful hints when common env issues occur
    const hint = (!process.env.GOOGLE_CSE_API_KEY || !process.env.GOOGLE_CSE_CX)
      ? 'Missing GOOGLE_CSE_API_KEY or GOOGLE_CSE_CX environment variables.'
      : undefined;
    // Mirror PHP behavior: 200 with error json
    return res.status(200).json({
      status: 'error',
      message: 'There was an issue with your keyword research request. Please try again.',
      technical_details: e.message,
      hint,
      code: 'KEYWORD_RESEARCH_ERROR',
    });
  }
}
