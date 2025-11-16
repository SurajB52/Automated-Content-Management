# Keyword Research App

A production-ready, minimal public extract of the Keyword Research and Blog Generation tool.

Enter a keyword + location, the app performs a Google Custom Search to fetch top results, extracts content, identifies top phrases/keywords, and sends structured context to Google Gemini to generate a high-quality blog draft.

## Features

- Keyword research via Google Custom Search API (CSE)
- HTML fetching and main-text extraction for top results
- NLP analysis (spaCy + NLTK) to surface phrases and single-word keywords
- Admin UI to run searches, view results, and generate blog content
- Blog generation with Google Gemini (JSON-only output spec)
- MySQL persistence for keyword research and blog data

## Tech Stack

- Next.js 14, React 18, TypeScript in app layer
- API routes (Node.js) for admin endpoints
- MySQL (mysql2/promise) connection pooling
- Python 3 for search/analysis pipeline
- NLP: spaCy, NLTK, trafilatura/readability

## Project Structure

```
├─ scripts/
│  ├─ keyword_search.py              # Python: CSE fetch, HTML extraction, NLP
│  └─ keyword_research_full_schema.sql
├─ src/
│  ├─ app/                           # Next.js app router pages
│  ├─ lib/                           # Database, logging, auth/session utilities
│  ├─ pages/api/admin/               # Server API routes
│  │  └─ keyword-research/           # Search, quota, generation endpoints
├─ .env.example                      # Template of all env variables (no secrets)
├─ requirements.txt                  # Python dependencies
├─ next.config.mjs                   # Next.js config
├─ tsconfig.json
├─ package.json
└─ README.md
```

## Prerequisites

- Node.js 18.17+
- Python 3.9+ with venv
- MySQL 8+ (or compatible)
- Google Custom Search API key + CX
- Google Gemini API key

## Environment Variables

Copy and fill your env:

```
cp .env.example .env
```

Required (minimum):

- GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX
- GEMINI_API_KEY (and optional GEMINI_API_URL)
- BUSINESS_DB_HOST, BUSINESS_DB_USER, BUSINESS_DB_PASSWORD, BUSINESS_DB_NAME
- NEXT_PUBLIC_ADMIN_PANEL_TOKEN (a short token for admin path)

Useful optional:

- UPLOADS_ABS_ROOT (absolute path for uploads)
- KR_PYTHON / PYTHON_BIN (python executable override)
- KR_PY_SCRIPT (override Python script path)
- LOG_DB_CONNECTIONS, ENABLE_DEBUG_LOGS

## Database Setup

Create DB and import schema:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p app < scripts/keyword_research_full_schema.sql
```

Ensure your DB user has privileges on the target DB and your `.env` points to it.

## Install & Run (Development)

Install Node deps:

```bash
npm install
```

Create Python venv and install deps:

```bash
python3 -m venv .venv
source .venv/bin/activate   # macOS/Linux
pip install --upgrade pip
pip install -r requirements.txt
```

Start dev server:

```bash
npm run dev
```

- App runs at http://localhost:3000
- Admin UI path uses your token, e.g. `http://localhost:3000/<TOKEN>/admin/keyword-research`
  - If `NEXT_PUBLIC_ADMIN_PANEL_TOKEN=admin`, open `http://localhost:3000/admin/admin/keyword-research`

## Typical Flow

1) Enter a keyword (and location). Submit search.
2) Server calls Python pipeline to perform Google CSE, fetch pages, and extract content.
3) NLP identifies top phrases and single-word keywords.
4) Admin UI can generate a blog using Gemini with a strict JSON contract.
5) Content and metadata saved to MySQL. You can edit/publish via the UI.

## Production Build

```bash
npm run build
npm run start
```

Ensure `.env` is set in your deployment environment and that Python + required system libs are available if you plan to run the Python pipeline.

## Security & Secrets

- No secrets are committed. `.env` files are ignored by `.gitignore`.
- Only `.env.example` is included to list variables required.
- Do not place secrets in `NEXT_PUBLIC_*` envs. Those are exposed to the browser.

## Troubleshooting

- Google CSE: Missing/invalid key or CX will surface as a friendly API error JSON.
- Gemini: Ensure `GEMINI_API_KEY` is set; API returns 401/403 if not.
- Python: override path with `KR_PYTHON`/`PYTHON_BIN` if needed.
- DB: verify credentials and schema import; check server console logs for details.

## How to Publish to a Public GitHub Repo

1) Initialize Git (if not already):
   ```bash
   git init
   git add .
   git commit -m "feat: initial public keyword research app"
   ```

2) Create a new public repo on GitHub
   - Go to https://github.com/new
   - Set Repository name, choose Public, add a description
   - Skip adding .gitignore/README here (already in project)

3) Add remote and push
   ```bash
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

4) Add repository metadata (optional)
   - Add topics like `nextjs`, `nlp`, `gemini`, `keyword-research`
   - Add a short description and a link to any live demo

5) Verify
   - Check that `.env` is not in the repo
   - Ensure no logs/uploads were committed (ignored by `.gitignore`)

## License

You can add a license of your choice (e.g., MIT) depending on your preference before publishing.
