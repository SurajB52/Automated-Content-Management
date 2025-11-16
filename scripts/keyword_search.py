#!/usr/bin/env python3
"""
KEYWORD RESEARCH AND ANALYSIS SCRIPT
====================================

PURPOSE:
This script performs comprehensive keyword research by:
1. Searching Google for a given keyword and location
2. Extracting content from top search results
3. Analyzing keywords and phrases present in articles
4. Checking keyword presence in HTML headers (H1, H2, H3)
5. Calculating quality scores based on frequency and header placement

MAIN FUNCTIONS:
- google_search_api(): Performs Google Custom Search API calls
- fetch_page_html(): Downloads and extracts HTML content from URLs
- extract_main_text(): Extracts clean text content using trafilatura
- analyze_keywords(): Main keyword analysis with spaCy NLP processing
- find_phrase_in_headers(): Checks if keywords/phrases appear in headers
- extract_header_hierarchy(): Extracts H1, H2, H3 structure from HTML

KEY FEATURES:
- Keyword presence checking in article headers
- Quality scoring based on header hierarchy (H1=3pts, H2=1.5pts, H3=0.5pts)
- Content extraction from top 3 accessible articles
- NLP processing with spaCy for accurate keyword extraction
- Phrase analysis with n-grams (2-4 words)
- Header hierarchy analysis for SEO optimization

INPUT: keyword, location, search_engine
OUTPUT: JSON with search results, keyword analysis, and header data
"""

import json
import sys
import requests
import urllib.parse
import random
import re
from collections import Counter
import nltk
from nltk.util import ngrams
# import spacy  # Moved to try/except block below
import logging
import os
from bs4 import BeautifulSoup

# Flexible environment loader (no hardcoded single filename)
try:
    from pathlib import Path
    from dotenv import load_dotenv  # type: ignore
    project_root = Path(__file__).resolve().parents[1]
    explicit = os.environ.get('KR_ENV_FILE')
    autoload_all = os.environ.get('KR_ENV_AUTOLOAD_ALL') == '1'

    candidates = []
    if explicit:
        candidates.append(explicit)
    else:
        candidates.extend([
            '.env',
            '.env.local',
            '.env.production.local',
            '.env.production',
            '.env.development.local',
            '.env.development',
        ])

    loaded_any = False
    for name in candidates:
        env_path = Path(name)
        if not env_path.is_absolute():
            env_path = project_root / name
        if env_path.exists():
            load_dotenv(dotenv_path=str(env_path), override=False)
            loaded_any = True
            logging.info(f"Loaded environment from {env_path}")
            if not autoload_all:
                break
    if not loaded_any and explicit:
        logging.warning(f"KR_ENV_FILE set but not found: {explicit}")
except Exception:
    # Keep silent if dotenv not available or any error occurs
    pass

# Set up logging
log_file = os.path.join(os.path.dirname(__file__), 'keyword_analysis.log')
logging.basicConfig(
    filename=log_file,
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Set a custom NLTK data path in the project directory where web server has permissions
nltk_data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nltk_data')
os.makedirs(nltk_data_dir, exist_ok=True)
nltk.data.path.insert(0, nltk_data_dir)
logging.info(f"Using custom NLTK data directory: {nltk_data_dir}")

# Download necessary NLTK data if not already downloaded
try:
    nltk.data.find('corpora/stopwords')
    logging.info("NLTK stopwords found")
except LookupError:
    logging.warning("NLTK stopwords not found, downloading...")
    nltk.download('stopwords', download_dir=nltk_data_dir, quiet=True)
    logging.info("NLTK stopwords downloaded successfully")

# Load spaCy model with better error handling
try:
    import spacy
    nlp = spacy.load('en_core_web_sm')
    logging.info("spaCy model loaded successfully")
except ImportError as e:
    logging.warning(f"spaCy not available: {str(e)}")
    logging.info("Falling back to simple NLP processing without spaCy")
    nlp = None
except OSError as e:
    logging.warning(f"spaCy model not found: {str(e)}")
    try:
        logging.info("Attempting to download spaCy model...")
        import subprocess
        subprocess.check_call([
            sys.executable, 
            "-m", "spacy", "download", "en_core_web_sm", 
            "--user"  # Install in user directory to avoid permission issues
        ])
        nlp = spacy.load('en_core_web_sm')
        logging.info("spaCy model downloaded and loaded successfully")
    except Exception as download_error:
        logging.error(f"Failed to download spaCy model: {str(download_error)}")
        logging.info("Falling back to simple NLP processing without spaCy")
        nlp = None
except Exception as e:
    logging.error(f"Failed to load spaCy model: {str(e)}")
    nlp = None

# List of user agents for rotating to avoid detection
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
]

def get_random_user_agent():
    """Return a random user agent from the list."""
    return random.choice(USER_AGENTS)

def google_search_api(query, api_key, cx, num_results=10, start_index=1, search_type=None, 
                     file_type=None, site_search=None, safe_search='off', language='lang_en', 
                     country_restrict='countryAU'):
    """
    Perform a Google search using the official Google Custom Search JSON API.
    
    Args:
        query: The search query
        api_key: Your Google API key
        cx: Your Custom Search Engine ID
        num_results: Total number of results to return (may require multiple API calls)
        start_index: Starting index for search results (1-based)
        search_type: Type of search ('image' for image search)
        file_type: Filter by file type (e.g., 'pdf', 'doc', 'xls')
        site_search: Limit search to specific site (e.g., 'example.com')
        safe_search: Safe search level ('off', 'medium', 'high')
        language: Language restriction (e.g., 'lang_en' for English)
        country_restrict: Country restriction (e.g., 'countryAU' for Australia)
    
    Returns:
        A list of dictionaries containing search result data
    """
    # Build the API URL
    url = "https://www.googleapis.com/customsearch/v1"
    
    # Prepare to collect all results
    all_results = []
    
    # Modify query if site search is specified
    if site_search:
        query = f"{query} site:{site_search}"
    
    # Modify query if file type is specified
    if file_type:
        query = f"{query} filetype:{file_type}"
    
    # Set up parameters
    params = {
        'q': query,
        'key': api_key,
        'cx': cx,
        'num': min(num_results, 10),  # Max 10 results per request
        'start': start_index,
        'safe': safe_search
    }
    
    if search_type:
        params['searchType'] = search_type
    
    if language:
        params['lr'] = language
        
    if country_restrict:
        params['cr'] = country_restrict

    try:
        # Set up headers with random user agent to avoid detection
        headers = {
            'User-Agent': get_random_user_agent()
        }
        
        # Make the request
        response = requests.get(url, params=params, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            
            # Extract search results
            results = []
            if 'items' in data:
                for item in data['items']:
                    result = {
                        'title': item.get('title', 'No title'),
                        'url': item.get('link', ''),
                        'snippet': item.get('snippet', 'No snippet available'),
                        'displayLink': item.get('displayLink', '')
                    }
                    results.append(result)
                    all_results.append(result)
            
            return {
                'status': 'success',
                'results': all_results,
                'total_results': data.get('searchInformation', {}).get('totalResults', '0'),
                'search_time': data.get('searchInformation', {}).get('searchTime', 0),
                'query': query
            }
        else:
            return {
                'status': 'error',
                'message': f"API Error: {response.status_code}",
                'details': response.text
            }
            
    except Exception as e:
        return {
            'status': 'error',
            'message': str(e)
        }

def extract_header_hierarchy(html_content):
    """Extract header tags and their hierarchical relationships from HTML content."""
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        headers = []
        
        # Find all header tags in order of appearance
        for tag in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
            if tag.get_text(strip=True):
                header_level = int(tag.name[1])
                header_text = tag.get_text(strip=True).lower()
                headers.append({
                    'text': header_text,
                    'level': header_level,
                    'tag': tag.name
                })
        
        # Process hierarchical relationships
        header_hierarchy = {}
        current_parent = {1: None, 2: None, 3: None, 4: None, 5: None, 6: None}
        
        for i, header in enumerate(headers):
            level = header['level']
            text = header['text']
            
            # Update current parent for this level
            current_parent[level] = text
            
            # Clear all child levels
            for l in range(level + 1, 7):
                current_parent[l] = None
            
            # Find parent header (first non-None header at a higher level)
            parent_header = None
            for l in range(level - 1, 0, -1):
                if current_parent[l] is not None:
                    parent_header = current_parent[l]
                    break
            
            # Store header with its parent relationship
            header_hierarchy[text] = {
                'level': level,
                'parent': parent_header,
                'index': i  # Keep track of order for determining common parents
            }
        
        return header_hierarchy
    
    except Exception as e:
        logging.error(f"Error extracting header hierarchy: {str(e)}")
        return {}

def extract_headers_from_html(html_content):
    """Extract header tags from HTML content."""
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        headers = {
            'h1': [h.get_text(strip=True).lower() for h in soup.find_all('h1') if h.get_text(strip=True)],
            'h2': [h.get_text(strip=True).lower() for h in soup.find_all('h2') if h.get_text(strip=True)],
            'h3': [h.get_text(strip=True).lower() for h in soup.find_all('h3') if h.get_text(strip=True)]
        }
        return headers
    except Exception as e:
        logging.error(f"Error extracting headers: {str(e)}")
        return {'h1': [], 'h2': [], 'h3': []}

def clean_html(content):
    """Clean and normalize HTML text."""
    try:
        soup = BeautifulSoup(content, 'html.parser')
        # Remove script and style elements
        for script in soup(["script", "style"]):
            script.extract()
        # Get text
        text = soup.get_text(separator=" ", strip=True)
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        return text
    except Exception as e:
        logging.error(f"Error cleaning HTML: {str(e)}")
        return content

def find_phrase_in_headers(phrase, header_hierarchy):
    """Find which headers contain the phrase and determine hierarchy levels."""
    if not phrase or not header_hierarchy:
        return [], None
    
    phrase_lower = phrase.lower()
    matching_headers = []
    
    for header_text, header_info in header_hierarchy.items():
        if phrase_lower in header_text.lower():
            matching_headers.append(header_info)
    
    # Sort by appearance order
    matching_headers.sort(key=lambda x: x['index'])
    
    # Extract hierarchy levels
    hierarchy_levels = [h['level'] for h in matching_headers]
    
    # Find common parent header
    common_parent = None
    if matching_headers:
        # If we have matches, look for their common parent
        first_match = matching_headers[0]
        common_parent = first_match['parent']
    
    return hierarchy_levels, common_parent

def analyze_keywords(content, min_length=3, ngram_range=(2, 4)):
    """Analyze content to get keyword and phrase frequencies with hierarchical information."""
    # logging.info("Starting keyword analysis")
    # logging.debug(f"Content length: {len(content)} characters")
    
    if not nlp:
        logging.error("spaCy model not available, cannot perform keyword analysis")
        return [], [], {'h1': [], 'h2': [], 'h3': []}, {}
    
    try:
        # Extract header hierarchy from original HTML
        header_hierarchy = extract_header_hierarchy(content)
        # logging.info(f"Extracted header hierarchy with {len(header_hierarchy)} headers")
        
        # Extract headers from original HTML (for backward compatibility)
        headers = extract_headers_from_html(content)
        # logging.info(f"Extracted headers: {sum(len(h) for h in headers.values())} total headers found")
        
        # Clean and normalize text for keyword analysis
        cleaned_content = clean_html(content)
        cleaned_content = cleaned_content.lower()
        cleaned_content = re.sub(r'[^\w\s]', '', cleaned_content)  # Remove punctuation
        cleaned_content = re.sub(r'\d+', '', cleaned_content)      # Remove numbers
        # logging.debug("Text cleaned and normalized")
        
        # Tokenize with spaCy
        # logging.info("Starting spaCy tokenization")
        doc = nlp(cleaned_content)
        words = [token.text for token in doc if not token.is_punct and not token.is_space]
        # logging.debug(f"Found {len(words)} tokens after spaCy processing")
        
        # Define stop words
        stop_words = set(nltk.corpus.stopwords.words('english'))
        custom_stopwords = {
            'get', 'us', 'click', 'also', 'one', 'way', 'new',
            'whether', 'want', 'you', 'job', 'gregory', 'brw'
        }
        stop_words.update(custom_stopwords)
        # logging.debug(f"Using {len(stop_words)} stop words")
        
        # Single-word keywords
        single_words = [word for word in words if word.lower() not in stop_words and len(word) >= min_length]
        single_word_freq = Counter(single_words)
        # logging.info(f"Found {len(single_word_freq)} unique single words")
        
        # Multi-word phrases
        phrases = []
        for n in range(ngram_range[0], ngram_range[1] + 1):
            n_grams = ngrams(words, n)
            valid_phrases = [
                ' '.join(gram) for gram in n_grams 
                if gram[0].lower() not in stop_words 
                and gram[-1].lower() not in stop_words
            ]
            phrases.extend(valid_phrases)
        phrase_freq = Counter(phrases)
        # logging.info(f"Found {len(phrase_freq)} unique phrases")
        
        # Get top results - increased to 150 from 30
        top_single_words = single_word_freq.most_common(150)
        top_phrases_raw = phrase_freq.most_common(200)  # Get more phrases to account for filtering
        
        # Enhance phrase data with hierarchical information
        top_phrases = []
        for phrase, freq in top_phrases_raw:
            # Find hierarchy levels and common parent for the phrase
            hierarchy_levels, common_parent = find_phrase_in_headers(phrase, header_hierarchy)
            
            # Check presence in h1, h2, h3 tags
            in_h1 = any(phrase in h for h in headers['h1'])
            in_h2 = any(phrase in h for h in headers['h2'])
            in_h3 = any(phrase in h for h in headers['h3'])
            
            # Count frequency in h1, h2, h3 tags
            h1_freq = sum(h.count(phrase) for h in headers['h1'])
            h2_freq = sum(h.count(phrase) for h in headers['h2'])
            h3_freq = sum(h.count(phrase) for h in headers['h3'])
            
            # Create enhanced phrase data
            phrase_data = [
                phrase, 
                freq,
                {
                    'in_h1': in_h1,
                    'in_h2': in_h2,
                    'in_h3': in_h3,
                    'h1_frequency': h1_freq,
                    'h2_frequency': h2_freq,
                    'h3_frequency': h3_freq,
                    'hierarchy_levels': hierarchy_levels,
                    'common_parent_header': common_parent
                }
            ]
            top_phrases.append(phrase_data)
        
        # Keep only top 150 phrases
        top_phrases = top_phrases[:150]
        
        # logging.info("Keyword analysis completed successfully")
        # logging.debug(f"Top single words: {top_single_words[:5]}")
        # logging.debug(f"Top phrases: {[p[0] for p in top_phrases[:5]]}")
        
        return top_single_words, top_phrases, headers, header_hierarchy
        
    except Exception as e:
        logging.error(f"Error in keyword analysis: {str(e)}")
        return [], [], {'h1': [], 'h2': [], 'h3': []}, {}

def extract_combined_text(search_results):
    """Extract text from search results for keyword analysis."""
    # logging.info("Extracting combined text from search results")
    combined_text = ""
    try:
        # First, try to extract and process all available HTML content
        html_available = False
        
        for result in search_results:
            if 'html' in result and result['html']:
                html_available = True
                # Clean the HTML before adding it
                soup = BeautifulSoup(result['html'], 'html.parser')
                # Remove script and style elements
                for script in soup(["script", "style"]):
                    script.extract()
                # Add the cleaned HTML
                combined_text += str(soup) + " "
            else:
                # Create structured HTML for non-HTML content
                combined_text += f"<div class='search-result'>"
                combined_text += f"<h1>{result.get('title', '')}</h1>"
                combined_text += f"<p>{result.get('snippet', '')}</p>"
                combined_text += "</div> "
        
        if not html_available:
            # If no HTML is available, create more structured pseudo-HTML 
            # with different header levels to enable header hierarchy analysis
            for i, result in enumerate(search_results):
                # Create a structured div for each result
                combined_text += "<div class='search-result'>"
                
                # Distribute headers across h1, h2, h3 to ensure we have content in each
                if i % 3 == 0:
                    # First result in each group gets h1
                    combined_text += f"<h1>{result.get('title', '')}</h1>"
                elif i % 3 == 1:
                    # Second result gets h2
                    combined_text += f"<h2>{result.get('title', '')}</h2>"
                else:
                    # Third result gets h3
                    combined_text += f"<h3>{result.get('title', '')}</h3>"
                
                # Add snippet as paragraph
                combined_text += f"<p>{result.get('snippet', '')}</p>"
                combined_text += "</div> "
        
        # Wrap everything in a proper HTML structure
        combined_text = f"<html><body>{combined_text}</body></html>"
        
        # logging.debug(f"Extracted {len(combined_text)} characters of combined text")
        return combined_text
    except Exception as e:
        logging.error(f"Error extracting combined text: {str(e)}")
        return ""

# NEW: helper to fetch full HTML page so we can send full text of top articles to Gemini
def fetch_page_html(url: str, timeout: int = 10) -> str:
    """Download the HTML for a page. Returns empty string on failure."""
    try:
        headers = {"User-Agent": get_random_user_agent()}
        resp = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
        if resp.status_code == 200 and "text/html" in resp.headers.get("content-type", ""):
            return resp.text
    except Exception as e:
        logging.warning(f"Failed to fetch {url}: {str(e)}")
    return ""

# Robust main-content extractor (tries trafilatura → readability-lxml → fallback BS4)
try:
    import trafilatura  # type: ignore

    def extract_main_text(html: str, max_chars: int = 20000) -> str:
        if not html:
            return ""
        try:
            # Use trafilatura with better settings for article extraction
            text = trafilatura.extract(
                html, 
                include_comments=False, 
                include_tables=True,  # Keep tables as they might have useful info
                include_links=False,  # Remove links to reduce noise
                favour_recall=True,   # Get more content rather than being too strict
                deduplicate=True      # Remove duplicate content
            )
            if text:
                # Clean up the extracted text
                cleaned_text = re.sub(r'\s+', ' ', text.strip())  # Normalize whitespace
                # Filter out common navigation text
                nav_patterns = [
                    r'menu\s*close\s*close\s*menu',
                    r'keyboard_arrow_\w+\s*back\s*to\s*previous',
                    r'back\s*to\s*previous\s*menu',
                    r'close\s*menu',
                    r'skip\s*to\s*content',
                    r'toggle\s*navigation'
                ]
                for pattern in nav_patterns:
                    cleaned_text = re.sub(pattern, '', cleaned_text, flags=re.IGNORECASE)
                
                return cleaned_text[:max_chars]
        except Exception as e:
            logging.warning(f"Trafilatura failed: {str(e)}")
        return ""
except ImportError:
    from bs4 import BeautifulSoup
    try:
        from readability import Document  # type: ignore

        def extract_main_text(html: str, max_chars: int = 20000) -> str:
            if not html:
                return ""
            try:
                doc = Document(html)
                summary_html = doc.summary()
                soup = BeautifulSoup(summary_html, 'html.parser')
                text = soup.get_text(separator=" ", strip=True)
                # Clean up the extracted text
                cleaned_text = re.sub(r'\s+', ' ', text.strip())  # Normalize whitespace
                # Filter out common navigation text
                nav_patterns = [
                    r'menu\s*close\s*close\s*menu',
                    r'keyboard_arrow_\w+\s*back\s*to\s*previous',
                    r'back\s*to\s*previous\s*menu',
                    r'close\s*menu',
                    r'skip\s*to\s*content',
                    r'toggle\s*navigation'
                ]
                for pattern in nav_patterns:
                    cleaned_text = re.sub(pattern, '', cleaned_text, flags=re.IGNORECASE)
                return cleaned_text[:max_chars]
            except Exception as e:
                logging.warning(f"Readability failed: {str(e)}")
                # fall through to simple cleanup
                soup = BeautifulSoup(html, 'html.parser')
                # Remove more navigation and non-content elements
                for tag in soup(['script', 'style', 'header', 'footer', 'nav', 'aside', 'form', 'iframe', 'button', 'input']):
                    tag.decompose()
                # Remove elements with navigation-related classes/ids
                for element in soup.find_all(attrs={'class': re.compile(r'(nav|menu|breadcrumb|sidebar|footer|header)', re.I)}):
                    element.decompose()
                for element in soup.find_all(attrs={'id': re.compile(r'(nav|menu|breadcrumb|sidebar|footer|header)', re.I)}):
                    element.decompose()
                text = " ".join(soup.stripped_strings)
                # Clean up the extracted text
                cleaned_text = re.sub(r'\s+', ' ', text.strip())  # Normalize whitespace
                # Filter out common navigation text
                nav_patterns = [
                    r'menu\s*close\s*close\s*menu',
                    r'keyboard_arrow_\w+\s*back\s*to\s*previous',
                    r'back\s*to\s*previous\s*menu',
                    r'close\s*menu',
                    r'skip\s*to\s*content',
                    r'toggle\s*navigation'
                ]
                for pattern in nav_patterns:
                    cleaned_text = re.sub(pattern, '', cleaned_text, flags=re.IGNORECASE)
                return cleaned_text[:max_chars]
    except ImportError:
        from bs4 import BeautifulSoup

        def extract_main_text(html: str, max_chars: int = 20000) -> str:
            if not html:
                return ""
            soup = BeautifulSoup(html, 'html.parser')
            # Remove more navigation and non-content elements
            for tag in soup(['script', 'style', 'header', 'footer', 'nav', 'aside', 'form', 'iframe', 'button', 'input']):
                tag.decompose()
            # Remove elements with navigation-related classes/ids
            for element in soup.find_all(attrs={'class': re.compile(r'(nav|menu|breadcrumb|sidebar|footer|header)', re.I)}):
                element.decompose()
            for element in soup.find_all(attrs={'id': re.compile(r'(nav|menu|breadcrumb|sidebar|footer|header)', re.I)}):
                element.decompose()
            text = " ".join(soup.stripped_strings)
            # Clean up the extracted text
            cleaned_text = re.sub(r'\s+', ' ', text.strip())  # Normalize whitespace
            # Filter out common navigation text
            nav_patterns = [
                r'menu\s*close\s*close\s*menu',
                r'keyboard_arrow_\w+\s*back\s*to\s*previous',
                r'back\s*to\s*previous\s*menu',
                r'close\s*menu',
                r'skip\s*to\s*content',
                r'toggle\s*navigation'
            ]
            for pattern in nav_patterns:
                cleaned_text = re.sub(pattern, '', cleaned_text, flags=re.IGNORECASE)
            return cleaned_text[:max_chars]

def main():
    # logging.info("Starting keyword search process")
    try:
        # Read input from stdin if available
        if not sys.stdin.isatty():
            try:
                input_data = json.load(sys.stdin)
            except json.JSONDecodeError as e:
                logging.error(f"Failed to parse input JSON: {str(e)}")
                print(json.dumps({
                    'status': 'error',
                    'message': f'Invalid input JSON: {str(e)}'
                }))
                return
            # Extract inputs
            keyword = str(input_data.get('keyword', '')).strip()
            location = str(input_data.get('location', '')).strip()
            
            api_key = os.environ.get("GOOGLE_CSE_API_KEY", "")
            cx = os.environ.get("GOOGLE_CSE_CX", "")
            # logging.info(f"Received input - keyword: {keyword}, location: {location}")
        else:
            keyword = ""
            location = ""
            logging.warning("No input received, using default empty values")
        
        # Combine keyword and location
        search_query = f"{keyword} {location}".strip()
        # logging.info(f"Combined search query: {search_query}")
        
        if not search_query:
            logging.error("No search query provided")
            result = {
                "status": "error",
                "message": "No search query provided"
            }
        else:
            # Use environment credentials obtained above
            
            # Perform the search
            # logging.info("Performing Google search")
            search_results = google_search_api(
                query=search_query,
                api_key=api_key,
                cx=cx,
                num_results=10,
                language='lang_en',
                country_restrict='countryAU'
            )
            
            # NEW: fetch pages until we gather 3 good articles (accessible&scrapable)
            if search_results.get('status') == 'success' and 'results' in search_results:
                good_count = 0
                for res in search_results['results']:
                    if good_count >= 3:
                        break
                    # Skip if we already attempted this one
                    if 'accessible' in res:
                        if res.get('accessible') and res.get('scrapable'):
                            good_count += 1
                        continue

                    html_page = fetch_page_html(res.get('url', ''))

                    accessible = bool(html_page)
                    main_text  = extract_main_text(html_page)
                    scrapable  = bool(main_text)

                    # Store diagnostic flags and data
                    res['html']        = html_page  # keep raw until later cleanup
                    res['main_text']   = main_text
                    res['accessible']  = accessible
                    res['scrapable']   = scrapable
                    if not accessible:
                        res['scrape_error'] = 'fetch_failed'
                    elif not scrapable:
                        res['scrape_error'] = 'no_main_text'
                    else:
                        res['scrape_error'] = ''
                        good_count += 1
            
            if search_results['status'] == 'success' and 'results' in search_results:
                # logging.info(f"Found {len(search_results['results'])} search results")
                
                # Validate search results structure
                if not isinstance(search_results['results'], list):
                    logging.error("Search results is not a list, converting to empty list")
                    search_results['results'] = []
                
                # Extract all text from search results for keyword analysis
                combined_text = extract_combined_text(search_results['results'])
                
                # Analyze keywords in the combined text
                single_words, phrases, headers, header_hierarchy = analyze_keywords(combined_text)
                # logging.info(f"Keyword analysis completed - {len(single_words)} words, {len(phrases)} phrases")
                
                # Validate keyword analysis results
                if not isinstance(single_words, list):
                    logging.warning("Single words is not a list, converting to empty list")
                    single_words = []
                if not isinstance(phrases, list):
                    logging.warning("Phrases is not a list, converting to empty list")
                    phrases = []
                if not isinstance(headers, dict):
                    logging.warning("Headers is not a dict, using default structure")
                    headers = {'h1': [], 'h2': [], 'h3': []}
                
                # Format phrases for output
                formatted_phrases = []
                for phrase_data in phrases:
                    # Validate phrase data structure
                    if not isinstance(phrase_data, (list, tuple)) or len(phrase_data) < 3:
                        logging.warning(f"Invalid phrase data format: {phrase_data}")
                        continue
                        
                    phrase, frequency, metadata = phrase_data
                    formatted_phrase = {
                        'phrase': phrase,
                        'frequency': frequency,
                        'in_h1': metadata['in_h1'],
                        'in_h2': metadata['in_h2'],
                        'in_h3': metadata['in_h3'],
                        'h1_frequency': metadata['h1_frequency'],
                        'h2_frequency': metadata['h2_frequency'],
                        'h3_frequency': metadata['h3_frequency'],
                        'hierarchy_levels': metadata['hierarchy_levels'],
                        'common_parent_header': metadata['common_parent_header']
                    }
                    formatted_phrases.append(formatted_phrase)
                
                # Add keyword analysis to the results
                search_results['keyword_analysis'] = {
                    'single_words': single_words,
                    'phrases': formatted_phrases
                }
                search_results['header_analysis'] = headers
                search_results['header_hierarchy'] = header_hierarchy
                
                # --- Garbage / nav-token filtering ---------------------------------
                DIRTY_TOKENS = {
                    'menu', 'close', 'keyboard_arrow_left', 'keyboard_arrow_right',
                    'back', 'previous', 'close menu', 'menu close'
                }

                # Filter single words
                single_words = [sw for sw in single_words if sw[0] not in DIRTY_TOKENS]

                # Filter phrases containing any dirty token
                formatted_phrases = [fp for fp in formatted_phrases if not any(tok in fp['phrase'] for tok in DIRTY_TOKENS)]

                # ------------------------------------------------------------------
                
                # Strip raw HTML before returning to backend to lighten payload
                for r in search_results['results']:
                    r.pop('html', None)
                
                # Re-order results so that accessible & scrapable ones come first
                search_results['results'].sort(key=lambda x: (not x.get('accessible', False), not x.get('scrapable', False)))
                
                # logging.debug("Added keyword analysis and header analysis to results")
            else:
                logging.error(f"Search failed: {search_results.get('message', 'Unknown error')}")
            
            result = search_results
        
        # Print results as JSON
        print(json.dumps(result))
        # logging.info("Successfully completed and returned results")
        
    except Exception as e:
        logging.error(f"Error in main function: {str(e)}")
        print(json.dumps({
            'status': 'error',
            'message': str(e)
        }))

if __name__ == "__main__":
    main() 