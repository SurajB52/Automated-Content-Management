'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState, useEffect, useRef } from 'react'
import { 
  Search as MagnifyingGlassIcon, 
  ChevronDown as ChevronDownIcon, 
  ChevronUp as ChevronUpIcon, 
  Trash2 as TrashIcon, 
  RefreshCw as ArrowPathIcon,
  FileText as DocumentTextIcon,
  AlertCircle as ExclamationCircleIcon,
  Check as CheckIcon,
  X as XMarkIcon
} from 'lucide-react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { getAdminUrl, adminFetch } from '@/config/adminApi'
import ADMIN_API_CONFIG from '@/config/adminApi'
import { toast } from 'react-hot-toast'

interface KeywordResult {
  id: string;
  keyword: string;
  location: string;
  created_by: string;
  created_at: string;
  blog_generated: number;
  blog_id?: number | null;
  blog_title?: string;
  blog_status?: string;
  blog_published_at?: string;
  blog_slug?: string;
}

interface QuotaInfo {
  limit: number;
  used: number;
  remaining: number;
}

interface BulkProgress {
  current: number;
  total: number;
  inProgress: boolean;
}

type ProcessingStage = 'processing' | 'generating' | 'finished';

interface ProcessingProgress {
  stage: ProcessingStage;
  progress: number;
  keywordId?: string;
}

// Blog generation filter type
type BlogGeneratedFilterType = 'not_generated' | 'generated' | 'all';

const PROCESSING_STAGES: ProcessingStage[] = [
  'processing',
  'generating',
  'finished'
];

const STAGE_LABELS: Record<ProcessingStage, string> = {
  processing: 'Starting Process',
  generating: 'Generating Content',
  finished: 'Completed'
};

// Define more detailed stages for blog generation
const DETAILED_STAGES = [
  { key: 'preparing', label: 'Preparing keyword data' },
  { key: 'extracting', label: 'Extracting keywords for content' },
  { key: 'generating', label: 'Generating blog with AI' },
  { key: 'formatting', label: 'Formatting content' },
  { key: 'saving', label: 'Saving blog to database' },
  { key: 'completed', label: 'Blog generation completed' }
];

export default function KeywordResearch() {
  const params = useParams() as { token?: string }
  const token = params?.token || ''
  const pathname = usePathname()
  const envToken = process.env.NEXT_PUBLIC_ADMIN_PANEL_TOKEN || ''
  const baseAdminPath = '/keyword-research'
  const [keyword, setKeyword] = useState('');
  const [suffix, setSuffix] = useState('');
  const [location, setLocation] = useState('Australia');
  const [searchEngine, setSearchEngine] = useState('google.com.au');
  const [isSuffixDropdownOpen, setIsSuffixDropdownOpen] = useState(false);
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const [isSearchEngineDropdownOpen, setIsSearchEngineDropdownOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<KeywordResult[]>([]);
  const [isSearched, setIsSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [blogGeneratedFilter, setBlogGeneratedFilter] = useState<BlogGeneratedFilterType>('generated');
  const [isBlogFilterDropdownOpen, setIsBlogFilterDropdownOpen] = useState(false);
  
  // New filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [groupFilter, setGroupFilter] = useState('all');
  const [showOnlyRewritten, setShowOnlyRewritten] = useState(false);
  const [dateFilter, setDateFilter] = useState('all_time');
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);
  const [bulkKeywords, setBulkKeywords] = useState('');
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress>({ current: 0, total: 0, inProgress: false });
  const bulkUploadRef = useRef<HTMLTextAreaElement>(null);
  const [searchProgress, setSearchProgress] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10; // Number of items per page
  
  // Settings state variables
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  
  // Selected keywords for bulk operations
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [isBlogGenerating, setIsBlogGenerating] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress>({
    stage: 'processing',
    progress: 0
  });
  const [currentKeywordIndex, setCurrentKeywordIndex] = useState(0);
  // Add state for the latest keyword ID to auto-generate blog
  const [latestKeywordId, setLatestKeywordId] = useState<string | null>(null);
  
  // Prompt settings state variables
  const [companyName, setCompanyName] = useState('');
  const [companyAbout, setCompanyAbout] = useState('');
  const [companyDetails, setCompanyDetails] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [keywordGuideline, setKeywordGuideline] = useState('');
  
  // Common suffix options for industry
  const suffixOptions = [
    '',
    'near me',
    'in Australia',
    'cost',
    'price',
    'reviews',
    'installation',
    'rebates',
    'incentives',
    'savings',
    'benefits',
    'vs',
    'how to'
  ];
  
  // Location options
  const locationOptions = [
    'Australia',
    'Sydney',
    'Melbourne',
    'Brisbane',
    'Perth',
    'Adelaide',
    'Gold Coast',
    'Canberra',
    'Newcastle',
    'Wollongong',
    'Hobart'
  ];
  
  // Search engine options
  const searchEngineOptions = [
    { label: 'Google Australia', value: 'google.com.au' },
    { label: 'Google USA', value: 'google.com' },
    { label: 'Google UK', value: 'google.co.uk' },
    { label: 'Google Canada', value: 'google.ca' },
    { label: 'Google India', value: 'google.co.in' }
  ];

  // Bulk processing popup state
  const [showBulkProcessingPopup, setShowBulkProcessingPopup] = useState(false);
  const [bulkProcessingProgress, setBulkProcessingProgress] = useState({
    current: 0,
    total: 0,
    currentKeyword: '',
    status: '',
    errors: [] as Array<{ keyword: string, error: string }>,
    successes: [] as Array<string>
  });

  // Add stage for detailed progress tracking
  const [generationStage, setGenerationStage] = useState(0);

  // Set autoGenerateBlogEnabled to always true
  const [autoGenerateBlogEnabled] = useState(true);
  const [companyInfo, setCompanyInfo] = useState('');

  // Add blogTarget state
  const [blogTarget, setBlogTarget] = useState("customer_kr");

  // Load system prompt when settings section is opened
  useEffect(() => {
    if (isSettingsPanelOpen) {
      fetchPromptSettings();
    }
  }, [blogTarget, isSettingsPanelOpen]);

  // Fetch results when component mounts or filter changes
  useEffect(() => {
    fetchQuotaInfo();
    fetchPromptSettings();
    fetchKeywordResults();
  }, [currentPage, blogGeneratedFilter, itemsPerPage]);

  // Add a loading indicator for the table
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false); // Add a specific state for single keyword search

  const fetchQuotaInfo = async () => {
    try {
      setIsLoadingQuota(true);
      const response = await adminFetch(getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.quotaCheck));
      const data = await response.json();
      // Support both shapes: { success, data } or { status, quota }
      if (data?.success && data?.data) {
        setQuota(data.data);
      } else if (data?.status && data?.quota) {
        setQuota({
          limit: Number(data.quota.limit ?? 100),
          used: Number(data.quota.used ?? 0),
          remaining: Number(data.quota.remaining ?? 0),
        });
      } else {
        console.error('Error fetching quota:', data?.message || 'Unknown');
      }
    } catch (err: any) {
      console.error('Error fetching quota information:', err);
    } finally {
      setIsLoadingQuota(false);
    }
  };

  // Fetch prompt settings from the API
  const fetchPromptSettings = async () => {
    try {
      setIsLoadingPrompt(true);
      setPromptError(null);
      
      // Always fetch company information from customer_kr (base settings)
      const companyResponse = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.blogContentManager.getSystemPrompt), 
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'blog_content_keyword_research',
            prompt_for: 'customer_kr'
          })
        }
      );
      
      const companyData = await companyResponse.json();
      
      // Fetch prompt specific to the selected target
      const promptResponse = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.blogContentManager.getSystemPrompt), 
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'blog_content_keyword_research',
            prompt_for: blogTarget || 'customer_kr'
          })
        }
      );
      
      const promptData = await promptResponse.json();
      
      if (companyData.success && promptData.success) {
        // Use company info from customer_kr but prompt from selected target
        setCompanyName(companyData.data.company_name || '');
        setCompanyAbout(companyData.data.company_about || '');
        setCompanyDetails(companyData.data.company_details || '');
        setKeywordGuideline(companyData.data.keyword_guideline || '');
        setPrompt(promptData.data.prompt || ''); // This changes based on target
      } else {
        setPromptError((companyData.error || promptData.error) || 'Failed to fetch prompt settings');
      }
    } catch (err: any) {
      console.error('Error fetching prompt settings:', err);
      setPromptError(err.message || 'Failed to fetch prompt settings');
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  const fetchKeywordResults = async () => {
    setIsTableLoading(true);
    try {
      let url;
      
      if (blogGeneratedFilter === 'generated') {
        url = getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.list, { 
          blog_generated: '1',
          page: currentPage.toString(),
          per_page: itemsPerPage.toString()
        });
      } else if (blogGeneratedFilter === 'not_generated') {
        url = getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.list, { 
          blog_generated: '0',
          page: currentPage.toString(),
          per_page: itemsPerPage.toString()
        });
      } else {
        // 'all' option
        url = getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.list, {
          page: currentPage.toString(),
          per_page: itemsPerPage.toString()
        });
      }
        
      const response = await adminFetch(url);
      const responseText = await response.text();
      
      try {
        const data = JSON.parse(responseText);
        const ok = (data && (data.success === true || data.status === 'success'));
        if (ok && data.data) {
          setError(null);
          const items = data.data.items || [];
          
          // Ensure items is an array
          if (Array.isArray(items)) {
            // Enrich with blog details so Title column can display blog title
            const enriched = await Promise.all(items.map(async (it: any) => {
              const out: any = { ...it };
              try {
                const blogId = it.blog_id || it.blogId || null;
                if (blogId) {
                  const resp = await adminFetch(
                    getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.getBlogPost, { id: String(blogId) })
                  );
                  const ct = resp.headers.get('content-type') || '';
                  if (ct.includes('application/json')) {
                    const blogData = await resp.json();
                    if (blogData?.success && blogData?.data) {
                      out.blog_title = blogData.data.title || out.blog_title;
                      out.blog_status = blogData.data.status || out.blog_status;
                      out.blog_published_at = blogData.data.published_at || blogData.data.scheduled_publish || out.blog_published_at;
                      out.blog_slug = blogData.data.slug || out.blog_slug;
                    }
                  } else {
                    // ignore non-JSON responses
                    await resp.text().catch(() => '');
                  }
                }
              } catch (e) {
                // best-effort enrichment; ignore errors
                console.warn('Blog enrich failed for item', it?.id, e);
              }
              return out;
            }));

            setSearchResults(enriched);
          } else {
            console.error('Expected array of items but got:', items);
            setSearchResults([]);
          }
          
          // Update pagination info
          if (data.data.pagination) {
            setTotalItems(data.data.pagination.total_items || 0);
            setTotalPages(data.data.pagination.total_pages || 1);
          } else {
            // If pagination info is not available, estimate based on results length
            const resultsLength = Array.isArray(items) ? items.length : 0;
            setTotalItems(resultsLength);
            setTotalPages(Math.ceil(resultsLength / itemsPerPage));
          }
          
          setIsSearched(true);
        } else {
          setError(data?.message || 'Failed to retrieve keyword research list');
        }
      } catch (jsonError: any) {
        console.error('JSON parsing error:', jsonError);
        setError(`Invalid JSON response: ${jsonError.message}`);
      }
    } catch (err: any) {
      console.error('Error fetching keyword list:', err);
      setError(`Failed to retrieve keyword list: ${err.message}`);
    } finally {
      setIsTableLoading(false);
    }
  };

  // Fix TypeScript errors by adding proper type checking and handling
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!keyword.trim()) {
      setSearchProgress('Please enter a keyword to search for');
      setTimeout(() => setSearchProgress(null), 3000);
      return;
    }
    
    if (!location.trim()) {
      setSearchProgress('Please enter a location to search for');
      setTimeout(() => setSearchProgress(null), 3000);
      return;
    }
    
    // Clear any previous errors
    setError(null);
    
    setIsSearching(true);
    setIsTableLoading(true);
    setSearchProgress('Processing...');
    
    try {
      let response: Response | null = null;
      
      try {
        response = await adminFetch(
          getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.search),
          {
            method: 'POST',
            body: JSON.stringify({
              keyword: keyword.trim(),
              location: location.trim(),
              search_engine: searchEngine,
              created_by: 'Admin',
              use_gemini_enhancement: Boolean(companyInfo),
              company_info: companyInfo
            })
          }
        );
      } catch (fetchError: any) {
        // Handle fetch errors gracefully
        console.error('Network error during search:', fetchError);
        setSearchProgress(`Network error: ${fetchError.message || 'Could not connect to server'}`);
        
        setTimeout(() => {
          setIsSearching(false);
          setIsTableLoading(false);
          setSearchProgress(null);
        }, 5000);
        
        return;
      }
      
      if (!response || !response.ok) {
        let errorMessage = `Server error (${response?.status || 'unknown'})`;
        
        try {
          if (response) {
            const errorData = await response.text();
            try {
              const parsedError = JSON.parse(errorData);
              errorMessage = parsedError.message || parsedError.error || `API Error (${response.status}): ${response.statusText}`;
            } catch {
              // If JSON parsing fails, use the raw error text
              errorMessage = `API Error (${response.status}): ${errorData.slice(0, 100)}`;
            }
          }
        } catch (textError) {
          // If we can't get the error text, use a generic message
          errorMessage = `API Error (${response?.status || 'unknown'}): Unable to get error details`;
        }
        
        // Display error in progress indicator instead of throwing
        setSearchProgress(`Keyword research failed: ${errorMessage}`);
        console.error('Search error:', errorMessage);
        
        // Clear loading states after a delay
        setTimeout(() => {
          setIsSearching(false);
          setIsTableLoading(false);
          setSearchProgress(null);
        }, 5000);
        
        return; // Exit the function instead of throwing
      }
      
      let data: any = null;
      try {
        data = await response.json();
      } catch (jsonError: any) {
        console.error('Error parsing response JSON:', jsonError);
        setSearchProgress('Error: Invalid response format from server');
        setTimeout(() => {
          setIsSearching(false);
          setIsTableLoading(false);
          setSearchProgress(null);
        }, 5000);
        return;
      }
      
      const ok = (data && (data.success === true || data.status === 'success'));
      if (!ok) {
        // Handle API error without throwing
        setSearchProgress(`Keyword research failed: ${data?.message || data?.error || 'Unknown error'}`);
        console.error('API returned error:', data?.message || data?.error);
        
        setTimeout(() => {
          setIsSearching(false);
          setIsTableLoading(false);
          setSearchProgress(null);
        }, 5000);
        
        return;
      }
      
      setSearchProgress('Keyword research completed successfully!');
      
      // Refresh the keyword results
      try {
        await fetchKeywordResults();
      } catch (refreshError) {
        console.error('Error refreshing results:', refreshError);
        // Don't show this error to the user, just log it
      }
      
      // Get the new keyword ID from flexible shapes
      const keywordId = data?.data?.id ?? data?.id;
      
      // Always auto-generate blog if we have a keywordId
      if (keywordId) {
        // Step 1: Trigger background HTML fetching (headings) before blog generation
        setSearchProgress('Fetching HTML & headings from sources...');
        try {
          const fetchTagsResp = await adminFetch(
            getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.fetchTags),
            {
              method: 'POST',
              body: JSON.stringify({ keyword_ids: [keywordId], fetch_tags_only: true }),
            }
          )
          // Non-blocking: API may return 200 (done) or 202 (started). We proceed regardless.
          // Attempt to consume body to avoid stream leaks; ignore content.
          await fetchTagsResp.text().catch(() => '')
        } catch (e: any) {
          console.warn('fetch-tags failed (continuing to blog gen):', e?.message || e)
        }

        // Step 2: Enrich phrases using stored headings
        setSearchProgress('Enriching phrases (H1/H2/H3, quality score)...');
        try {
          const enhanceResp = await adminFetch(
            getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.enhance),
            {
              method: 'POST',
              body: JSON.stringify({ id: keywordId }),
            }
          )
          await enhanceResp.text().catch(() => '')
        } catch (e: any) {
          console.warn('enhance failed (continuing to blog gen):', e?.message || e)
        }

        // Step 3: Start blog generation
        setSearchProgress('Starting blog generation...');
        setIsSearching(false);
        setIsBlogGenerating(true);
        
        // Start blog generation automatically
        try {
          await generateBlogForKeyword(keywordId);
        } catch (blogError: any) {
          console.error('Blog generation error:', blogError);
          setSearchProgress(`Blog generation failed: ${blogError.message || 'Unknown error'}`);
          setTimeout(() => {
            setSearchProgress(null);
            setIsBlogGenerating(false);
          }, 5000);
        }
      } else {
        // Clear loading state after a short delay
        setTimeout(() => {
          setIsSearching(false);
          setIsTableLoading(false);
          setSearchProgress(null);
        }, 1000);
      }
      
    } catch (err: any) {
      // Catch all other errors and handle them gracefully
      console.error('Search error:', err);
      setSearchProgress(`Keyword research failed: ${err.message || 'Unknown error'}`);
      
      // Clear loading states after a delay
      setTimeout(() => {
        setIsSearching(false);
        setIsTableLoading(false);
        setSearchProgress(null);
      }, 5000);
    }
  };

  // Update the generateBlogForKeyword function with better error handling
  const generateBlogForKeyword = async (keywordId: number) => {
    setIsBlogGenerating(true);
    setSearchProgress(`Preparing to generate blog content...`);

    // Start with preparing stage
    setProcessingProgress({
      stage: 'processing',
      progress: 10,
      keywordId: keywordId.toString()
    });

    try {
      // Simulate progress through stages
      await new Promise(resolve => setTimeout(resolve, 800));
      setSearchProgress(`Analyzing keyword data...`);
      setProcessingProgress({
        stage: 'processing',
        progress: 30,
        keywordId: keywordId.toString()
      });
      
      await new Promise(resolve => setTimeout(resolve, 800));
      setSearchProgress(`Preparing content structure...`);
      setProcessingProgress({
        stage: 'processing',
        progress: 50,
        keywordId: keywordId.toString()
      });
      
      await new Promise(resolve => setTimeout(resolve, 800));
      setSearchProgress(`Generating optimized blog content...`);
      setProcessingProgress({
        stage: 'generating',
        progress: 60,
        keywordId: keywordId.toString()
      });
      
      // Call the API to generate a blog for this keyword
      let response: Response | null = null;
      try {
        response = await adminFetch(
          getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.generateBlog),
          {
            method: 'POST',
            body: JSON.stringify({
              keyword_ids: [keywordId],
              target_type: 'blog_content_keyword_research',
              target_for: blogTarget || 'customer_kr'
            })
          }
        );
      } catch (fetchError: any) {
        setSearchProgress(`Network error: ${fetchError.message || 'Could not connect to server'}`);
        console.error('Network error during blog generation:', fetchError);
        
        setTimeout(() => {
          setIsBlogGenerating(false);
          setSearchProgress(null);
        }, 5000);
        
        return;
      }

      if (!response || !response.ok) {
        let errorMessage = `Server error (${response?.status || 'unknown'})`;
        
        try {
          if (response) {
            const errorText = await response.text();
            try {
              const errorData = JSON.parse(errorText);
              errorMessage = errorData.message || errorData.error || `API Error (${response.status})`;
            } catch {
              errorMessage = `API Error (${response.status}): ${errorText.slice(0, 100)}`;
            }
          }
        } catch (textError) {
          errorMessage = `API Error (${response?.status || 'unknown'}): Unable to get error details`;
        }
        
        setSearchProgress(`Blog generation failed: ${errorMessage}`);
        console.error('Blog generation error:', errorMessage);
        
        setTimeout(() => {
          setIsBlogGenerating(false);
          setSearchProgress(null);
        }, 5000);
        
        return;
      }

      let data: any = null;
      try {
        data = await response.json();
      } catch (jsonError: any) {
        setSearchProgress(`Error: Could not parse server response - ${jsonError.message}`);
        console.error('Error parsing blog generation response:', jsonError);
        
        setTimeout(() => {
          setIsBlogGenerating(false);
          setSearchProgress(null);
        }, 5000);
        
        return;
      }
      
      const isSuccess = Boolean(data && (data.success === true || data.status === 'success'));
      if (!isSuccess) {
        // Handle API error without throwing
        const msg = (data && (data.message || data.error)) || 'Unknown error';
        setSearchProgress(`Blog generation failed: ${msg}`);
        console.error('Blog generation API error:', msg);
        
        setTimeout(() => {
          setIsBlogGenerating(false);
          setSearchProgress(null);
        }, 5000);
        
        return;
      }

      // Update progress to almost finished
      setProcessingProgress({
        stage: 'generating',
        progress: 80,
        keywordId: keywordId.toString()
      });
      
      setSearchProgress(`Finalizing content and saving...`);
      
      // Refresh the keyword results to show updated blog_generated status
      try {
        await fetchKeywordResults();
      } catch (refreshError) {
        console.error('Error refreshing results after blog generation:', refreshError);
        // Continue despite the error
      }
      
      // Update to completed stage
      setProcessingProgress({
        stage: 'finished',
        progress: 100,
        keywordId: keywordId.toString()
      });
      
      // Success message - HTML fetching is now separate
      setSearchProgress('Blog generated successfully!');
      
      // Show success message for 3 seconds, then clear
      setTimeout(() => {
        setSearchProgress(null);
        setIsSearching(false);
        setIsTableLoading(false);
        setIsBlogGenerating(false);
      }, 3000);
    } catch (err: any) {
      console.error('Error during blog generation:', err);
      
      // Handle error without throwing
      setSearchProgress(`Blog generation failed: ${err.message || 'Unknown error'}`);
      setProcessingProgress({
        stage: 'processing',
        progress: 0,
        keywordId: keywordId.toString()
      });
      
      // Show error message for 5 seconds
      setTimeout(() => {
        setSearchProgress(null);
        setIsSearching(false);
        setIsTableLoading(false);
        setIsBlogGenerating(false);
      }, 5000);
    }
  };

  const handleBulkUpload = () => {
    setShowBulkUpload(true);
    setTimeout(() => {
      if (bulkUploadRef.current) {
        bulkUploadRef.current.focus();
      }
    }, 100);
  };

  const processBulkKeywords = async () => {
    if (!bulkKeywords.trim()) {
      setError('Please enter keywords for bulk research');
      toast.error('Please enter keywords for bulk research');
      return;
    }
    
    const keywordList = bulkKeywords
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    
    if (keywordList.length === 0) {
      setError('No valid keywords found');
      toast.error('No valid keywords found');
      return;
    }
    
    // Check if we have enough quota
    if (quota && quota.remaining < keywordList.length) {
      if (!window.confirm(`Warning: You have ${quota.remaining} searches remaining in your daily quota, but you're attempting to process ${keywordList.length} keywords. 
      
The free tier is limited to 100 searches per day (resets at midnight Pacific Time).

Some searches may fail. Continue anyway?`)) {
        return;
      }
    }
    
    // Initialize both progress states
    setBulkProgress({
      current: 0,
      total: keywordList.length,
      inProgress: true
    });
    
    setBulkProcessingProgress({
      current: 0,
      total: keywordList.length,
      currentKeyword: '',
      status: 'Processing...',
      errors: [],
      successes: []
    });
    
    // Show the popup
    setShowBulkProcessingPopup(true);
    
    setError(null);
    
    // Helper function to add delay between requests
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    try {
      for (let i = 0; i < keywordList.length; i++) {
        const currentKeyword = keywordList[i];
        
        // Update both progress states
        setSearchProgress(`Processing keyword ${i+1}/${keywordList.length}: "${currentKeyword}"`);
        setBulkProcessingProgress(prev => ({
          ...prev,
          current: i,
          currentKeyword: currentKeyword,
          status: `Processing (${i+1}/${keywordList.length}): "${currentKeyword}"`
        }));
        
        try {
          // Add a delay between requests (increased to 8 seconds)
          if (i > 0) {
            await delay(8000); // Increased delay to 8 seconds
          }
          
          // Call the API for this keyword
          const response = await adminFetch(
            getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.search),
            {
              method: 'POST',
              body: JSON.stringify({
                keyword: currentKeyword,
                location: location,
                search_engine: searchEngine,
                created_by: 'Admin User (Bulk)'
              })
            }
          );
          
          // Check if response is ok before parsing JSON
          if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          // Normalize API response from python_search (status/id) and other endpoints (success/data)
          const isSuccess = (data && (data.success === true || data.status === 'success'));
          const newKeywordId = data?.data?.id ?? data?.id;
          const apiMessage = data?.message || data?.error || data?.technical_details || 'Unknown error';
          
          if (!isSuccess) {
            console.error(`Failed to process keyword "${currentKeyword}": ${apiMessage}`);
            setSearchProgress(`Error with "${currentKeyword}": ${apiMessage}`);
            
            // Add to errors list with more detailed error message
            setBulkProcessingProgress(prev => ({
              ...prev,
              errors: [...prev.errors, {
                keyword: currentKeyword,
                error: apiMessage
              }]
            }));
            
            // If this is a database schema error, we should stop processing
            if (data.message && data.message.includes('Database')) {
              const errorMessage = `Database error: ${data.message}. Stopping bulk processing.`;
              setError(errorMessage);
              toast.error(errorMessage);
              setBulkProcessingProgress(prev => ({
                ...prev,
                status: errorMessage
              }));
              break;
            }
          } else {
            setSearchProgress(`Successfully analyzed "${currentKeyword}"`);
            
            // Add to successes list
            setBulkProcessingProgress(prev => ({
              ...prev,
              successes: [...prev.successes, currentKeyword]
            }));

            // Fetch HTML headings first, then start blog generation for this keyword
            if (newKeywordId) {
              setBulkProcessingProgress(prev => ({
                ...prev,
                status: `Fetching HTML/headings for "${currentKeyword}"...`
              }));

              try {
                // Step A: Trigger background fetch-tags
                try {
                  const ftResp = await adminFetch(
                    getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.fetchTags),
                    {
                      method: 'POST',
                      body: JSON.stringify({ keyword_id: newKeywordId }),
                    }
                  )
                  await ftResp.text().catch(() => '')
                } catch (ftErr: any) {
                  console.warn(`fetch-tags failed for "${currentKeyword}" (continuing):`, ftErr?.message || ftErr)
                }

                // Step B: Enrich phrases for this KR
                setBulkProcessingProgress(prev => ({
                  ...prev,
                  status: `Enriching phrases for "${currentKeyword}"...`
                }));
                try {
                  const enhResp = await adminFetch(
                    getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.enhance),
                    {
                      method: 'POST',
                      body: JSON.stringify({ id: newKeywordId }),
                    }
                  )
                  await enhResp.text().catch(() => '')
                } catch (e: any) {
                  console.warn(`enhance failed for "${currentKeyword}" (continuing):`, e?.message || e)
                }

                setBulkProcessingProgress(prev => ({
                  ...prev,
                  status: `Generating blog for "${currentKeyword}"...`
                }));

                const blogResponse = await adminFetch(
                  getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.generateBlog),
                  {
                    method: 'POST',
                    body: JSON.stringify({
                      keyword_ids: [newKeywordId],
                      target_type: 'blog_content_keyword_research',
                      target_for: blogTarget || 'customer_kr'
                    })
                  }
                );

                if (!blogResponse.ok) {
                  const blogErrorData = await blogResponse.json();
                  throw new Error(blogErrorData.message || `Failed to generate blog`);
                }

                const blogData = await blogResponse.json();
                
                if (!blogData.success) {
                  throw new Error(blogData.error || `Failed to generate blog`);
                }

                setBulkProcessingProgress(prev => ({
                  ...prev,
                  status: `Blog generated successfully for "${currentKeyword}"`
                }));
              } catch (blogErr: any) {
                console.error(`Error generating blog for "${currentKeyword}":`, blogErr);
                setBulkProcessingProgress(prev => ({
                  ...prev,
                  errors: [...prev.errors, { 
                    keyword: currentKeyword, 
                    error: `Blog generation failed: ${blogErr.message}` 
                  }]
                }));
              }
            }
            
            // Wait for an additional 2 seconds after successful processing
            // to ensure the server has time to complete any background tasks
            await delay(2000);
          }
        } catch (err: any) {
          console.error(`Error processing keyword "${currentKeyword}":`, err);
          setSearchProgress(`Error with "${currentKeyword}": ${err.message}`);
          
          // Add to errors list
          setBulkProcessingProgress(prev => ({
            ...prev,
            errors: [...prev.errors, { keyword: currentKeyword, error: err.message }]
          }));
          
          // Wait for 3 seconds after an error before trying the next keyword
          await delay(3000);
        }
        
        // Update bulk progress
        setBulkProgress(prev => ({
          ...prev,
          current: i + 1
        }));
        
        // Update popup progress
        setBulkProcessingProgress(prev => ({
          ...prev,
          current: i + 1
        }));
        
        // Refresh quota every 3 keywords instead of 5
        if (i % 3 === 0) {
          setSearchProgress("Refreshing quota information...");
          setBulkProcessingProgress(prev => ({
            ...prev,
            status: "Refreshing quota information..."
          }));
          
          await fetchQuotaInfo();
          
          // Add a small delay after refreshing quota
          await delay(1000);
        }
        
        // Check if we've hit the quota limit
        if (quota && quota.remaining <= 0) {
          const errorMessage = 'Daily quota limit reached. Bulk processing stopped.';
          setError(errorMessage);
          toast.error(errorMessage);
          setBulkProcessingProgress(prev => ({
            ...prev,
            status: errorMessage
          }));
          break;
        }
      }
      
      // Final refresh of results and quota
      setSearchProgress("Finalizing results...");
      setBulkProcessingProgress(prev => ({
        ...prev,
        status: "Finalizing results..."
      }));
      
      await fetchKeywordResults();
      await fetchQuotaInfo();
      
      // Set final status
      setBulkProcessingProgress(prev => ({
        ...prev,
        status: "Processing completed"
      }));
      
      // Reset bulk upload fields
      setBulkKeywords('');
      setShowBulkUpload(false);
      setSearchProgress(null);
      
    } catch (err: any) {
      const errorMessage = `Bulk processing error: ${err.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
      setBulkProcessingProgress(prev => ({
        ...prev,
        status: errorMessage
      }));
    } finally {
      // Update the regular progress state
      setBulkProgress({
        current: 0,
        total: 0,
        inProgress: false
      });
      setSearchProgress(null);
    }
  };
  
  const handleCloseBulkProcessingPopup = () => {
    setShowBulkProcessingPopup(false);
    // Reset the progress state
    setBulkProcessingProgress({
      current: 0,
      total: 0,
      currentKeyword: '',
      status: '',
      errors: [],
      successes: []
    });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this keyword research?')) {
      setIsDeleting(id);
      try {
        const response = await adminFetch(
          getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.delete, { id }),
          { method: 'DELETE' }
        );
        
        const responseText = await response.text();
        
        try {
          const data = JSON.parse(responseText);
          if (data.success) {
            setError(null);
            setSuccess(data.message || 'Record deleted successfully');
            setTimeout(() => setSuccess(null), 3000);
            await fetchKeywordResults();
          } else {
            setError(data.message || 'Failed to delete keyword research');
          }
        } catch (jsonError: any) {
          console.error('JSON parsing error:', jsonError);
          setError(`Invalid JSON response: ${jsonError.message}`);
        }
      } catch (err: any) {
        console.error('Error deleting keyword research:', err);
        setError(`Failed to delete keyword research: ${err.message}`);
      } finally {
        setIsDeleting(null);
      }
    }
  };

  // Update the handleBlogGeneration function for bulk generation
  const handleBlogGeneration = async () => {
    if (selectedKeywords.length === 0) {
      setSearchProgress('Please select at least one keyword to generate a blog');
      setTimeout(() => setSearchProgress(null), 3000);
      return;
    }

    setIsBlogGenerating(true);
    setCurrentKeywordIndex(0);

    const errors: Array<{ keywordId: string; error: string }> = [];
    const successes: Array<string> = [];

    try {
      // Process keywords one by one
      for (let i = 0; i < selectedKeywords.length; i++) {
        setCurrentKeywordIndex(i);
        const keywordId = selectedKeywords[i];
        
        setSearchProgress(`Generating blog ${i + 1} of ${selectedKeywords.length}...`);
        
        try {
          // Call the API to generate a blog for this keyword
          let response: Response | null = null;
          try {
            response = await adminFetch(
              getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.generateBlog),
              {
                method: 'POST',
                body: JSON.stringify({
                  keyword_ids: [keywordId],
                  target_type: 'blog_content_keyword_research',
                  target_for: blogTarget || 'customer_kr'
                })
              }
            );
          } catch (fetchError: any) {
            throw new Error(`Network error: ${fetchError.message || 'Could not connect to server'}`);
          }

          if (!response || !response.ok) {
            let errorMessage = `Server error (${response?.status || 'unknown'})`;
            
            try {
              if (response) {
                const errorText = await response.text();
                try {
                  const errorData = JSON.parse(errorText);
                  errorMessage = errorData.message || errorData.error || `API Error (${response.status})`;
                } catch {
                  errorMessage = `API Error (${response.status}): ${errorText.slice(0, 100)}`;
                }
              }
            } catch (textError) {
              errorMessage = `API Error (${response?.status || 'unknown'}): Unable to get error details`;
            }
            
            throw new Error(errorMessage);
          }

          let data: any = null;
          try {
            data = await response.json();
          } catch (jsonError: any) {
            throw new Error(`Could not parse server response: ${jsonError.message}`);
          }
          
          if (!data || !data.success) {
            throw new Error(data?.message || 'Unknown API error');
          }

          // Add to successes list
          successes.push(keywordId);

          // Success message for blog generation
          setSearchProgress(`Blog ${i + 1} generated successfully!`);
        } catch (err: any) {
          // Add to errors list but continue processing
          errors.push({ keywordId, error: err.message || 'Unknown error' });
          setSearchProgress(`Failed to generate blog for keyword ${i + 1}. Continuing with next...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        // Wait for 3 seconds before processing the next keyword
        if (i < selectedKeywords.length - 1) {
          setSearchProgress(`Waiting before processing next keyword...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // Refresh the keyword results to show updated blog_generated status
      try {
        await fetchKeywordResults();
      } catch (refreshError) {
        console.error('Error refreshing results after bulk blog generation:', refreshError);
        // Continue despite the error
      }
      
      // Show final status
      if (errors.length === 0) {
        setSearchProgress('All blogs generated successfully!');
      } else {
        setSearchProgress(`Blog generation completed with ${errors.length} error(s). Check the error log for details.`);
        
        // Log errors to console
        console.error('Blog generation errors:', errors);
        
        // Show toast notification if there are errors
        if (errors.length === 1) {
          toast.error(`Failed to generate 1 blog: ${errors[0].error}`);
        } else {
          toast.error(`${errors.length} blog(s) failed to generate. Check the console for details.`);
        }
      }
      
      // Clear the selection
      setSelectedKeywords([]);
      
      // Show status message for 3 seconds, then clear
      setTimeout(() => {
        setSearchProgress(null);
        setIsBlogGenerating(false);
      }, 3000);
    } catch (err: any) {
      // This catch is for errors in the overall function, not individual blog generations
      console.error('Error in bulk blog generation:', err);
      setSearchProgress(`Bulk blog generation failed: ${err.message || 'Unknown error'}`);
      
      // Show error message for 5 seconds
      setTimeout(() => {
        setSearchProgress(null);
        setIsBlogGenerating(false);
      }, 5000);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedKeywords.length === 0) return;
    if (!window.confirm(`Delete ${selectedKeywords.length} item(s)? This cannot be undone.`)) return;
    setIsBulkDeleting(true);
    try {
      for (const id of selectedKeywords) {
        try {
          const response = await adminFetch(
            getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.delete, { id }),
            { method: 'DELETE' }
          );
          if (!response.ok) {
            // best-effort: continue others
            try { const data = await response.json(); console.warn('Delete failed', id, data); } catch {}
          }
        } catch (e) {
          console.warn('Delete error', id, e);
        }
      }
      await fetchKeywordResults();
      setSelectedKeywords([]);
      setError(null);
      setSuccess('Selected records deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const getStageProgress = (currentStage: ProcessingStage) => {
    const currentIndex = PROCESSING_STAGES.indexOf(currentStage);
    return ((currentIndex + 1) / PROCESSING_STAGES.length) * 100;
  };

  const isStageComplete = (stage: ProcessingStage) => {
    const currentIndex = PROCESSING_STAGES.indexOf(processingProgress.stage);
    const stageIndex = PROCESSING_STAGES.indexOf(stage);
    return stageIndex < currentIndex;
  };

  const isStageActive = (stage: ProcessingStage) => {
    return stage === processingProgress.stage;
  };

  const handleCancelBlogGeneration = () => {
    if (window.confirm('Are you sure you want to cancel the blog generation process?')) {
      setIsBlogGenerating(false);
      setProcessingProgress({
        stage: 'processing',
        progress: 0
      });
      setSearchProgress(null);
    }
  };

  // Pagination handlers
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleGoToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="space-y-6">
        {/* Combined loading modal for both keyword research and blog generation */}
        {(isSearching || isBlogGenerating) && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm backdrop-saturate-150 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
              </div>
              
              <h3 className="text-lg font-medium text-gray-900 mb-2 text-center">
                {isBlogGenerating ? "Generating Blog Content" : "Keyword Research"}
              </h3>
              
              <div className="bg-blue-50 p-3 rounded-md border border-blue-100 mb-4">
                <p className="text-blue-700 text-sm">
                  {searchProgress || (isBlogGenerating ? "Generating blog content..." : "Searching for keywords...")}
                </p>
              </div>
              
              {isBlogGenerating && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${processingProgress.progress}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 text-center">
                    {STAGE_LABELS[processingProgress.stage]}
                  </p>
                </div>
              )}
              
              <div className="mt-4 flex justify-center">
                {isBlogGenerating && (
                  <button
                    onClick={handleCancelBlogGeneration}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Bulk Processing Popup */}
        {showBulkProcessingPopup && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm backdrop-saturate-150 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-4xl w-full m-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Bulk Keyword Research</h2>
                <button
                  onClick={handleCloseBulkProcessingPopup}
                  className="px-4 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700"
                >
                  Close
                </button>
              </div>

              <div className="space-y-6">
                {/* Progress Overview */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      Overall Progress
                    </span>
                    <span className="text-sm text-gray-500">
                      {bulkProcessingProgress.current} of {bulkProcessingProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${(bulkProcessingProgress.current / bulkProcessingProgress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
                
                {/* Status Message */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center text-gray-700">
                    <div className="mr-3">
                      {bulkProcessingProgress.current < bulkProcessingProgress.total ? (
                        <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <CheckIcon className="h-5 w-5 text-green-500" />
                      )}
                    </div>
                    <span className="text-sm font-medium">{bulkProcessingProgress.status}</span>
                  </div>
                  
                  {bulkProcessingProgress.currentKeyword && (
                    <div className="mt-2 pl-8 text-sm text-gray-600">
                      Current: <span className="font-medium">{bulkProcessingProgress.currentKeyword}</span>
                    </div>
                  )}
                </div>
                
                {/* Results Summary */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Successes */}
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <h3 className="text-sm font-medium text-green-800 flex items-center mb-2">
                      <CheckIcon className="h-4 w-4 mr-1" />
                      Successful Keywords <span className="ml-1 text-xs">({bulkProcessingProgress.successes.length})</span>
                    </h3>
                    <div className="max-h-60 overflow-y-auto">
                      {bulkProcessingProgress.successes.length > 0 ? (
                        <ul className="space-y-1">
                          {bulkProcessingProgress.successes.map((success, index) => (
                            <li key={index} className="text-sm text-green-700 py-1 px-2 rounded hover:bg-green-100">
                              {success}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No successfully processed keywords yet</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Errors */}
                  <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                    <h3 className="text-sm font-medium text-red-800 flex items-center mb-2">
                      <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                      Errors <span className="ml-1 text-xs">({bulkProcessingProgress.errors.length})</span>
                    </h3>
                    <div className="max-h-60 overflow-y-auto">
                      {bulkProcessingProgress.errors.length > 0 ? (
                        <ul className="space-y-1">
                          {bulkProcessingProgress.errors.map((error, index) => (
                            <li key={index} className="text-sm text-red-700 py-1 px-2 rounded hover:bg-red-100">
                              <span className="font-medium">{error.keyword}</span>: {error.error}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No errors so far</p>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex justify-end space-x-3">
                  {bulkProcessingProgress.current >= bulkProcessingProgress.total && (
                    <button
                      onClick={handleCloseBulkProcessingPopup}
                      className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Done
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="sm:flex sm:items-center sm:justify-between">
            <div className="sm:flex-auto">
              <h1 className="text-2xl font-semibold text-gray-900">Keyword Research</h1>
              <p className="mt-2 text-sm text-gray-700">
                Research and analyze industry keywords for your SEO strategy.
              </p>
            </div>
            
            {/* API Quota Display */}
            <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
              <div className="inline-flex items-center rounded-md bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 border border-gray-200">
                <div className="mr-2">
                  <span className="text-gray-500">Daily API Quota:</span>
                </div>
                
                {isLoadingQuota ? (
                  <div className="flex items-center">
                    <ArrowPathIcon className="w-4 h-4 mr-1 animate-spin" />
                    <span>Loading...</span>
                  </div>
                ) : quota ? (
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-2 ${
                      quota.remaining > 20 ? 'bg-green-500' : 
                      quota.remaining > 5 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></div>
                    <span>
                      {quota.remaining} / {quota.limit} remaining
                    </span>
                    <button 
                      onClick={fetchQuotaInfo}
                      className="ml-2 text-blue-600 hover:text-blue-800"
                      title="Refresh quota info"
                    >
                      <ArrowPathIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-gray-500">Unknown</span>
                )}
              </div>
              {quota && quota.remaining < 30 && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-md border border-red-200">
                  <p>Warning: Free tier limited to 100 queries daily.</p>
                  <p className="mt-1">Resets at midnight Pacific Time.</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-8 bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl">
            <div className="px-4 py-6 sm:p-8">
              {/* Regular Search Form */}
              {!showBulkUpload && (
                <form onSubmit={handleSearch} className="mt-2 space-y-4"> {/* Add space between inputs and buttons */}
                  {/* Input fields grid */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-7">
                    {/* Keyword Input */}
                    <div className="sm:col-span-3">
                      <label htmlFor="keyword" className="block text-xs font-medium text-gray-700 mb-1">
                        Main Keyword
                      </label>
                      <div className="relative rounded-md shadow-sm">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                        </div>
                        <input
                          id="keyword"
                          type="text"
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                          className="block w-full rounded-md border-0 py-3 pl-10 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                          placeholder="e.g. keyword"
                        />
                      </div>
                    </div>
                    
                    {/* Suffix Dropdown */}
                    <div className="sm:col-span-2">
                      <label htmlFor="suffix" className="block text-xs font-medium text-gray-700 mb-1">
                        Suffix (Optional)
                      </label>
                      <div className="relative">
                        <button
                          id="suffix"
                          type="button"
                          className="relative w-full cursor-default rounded-md bg-white py-3 pl-3 pr-10 text-left text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm sm:leading-6"
                          onClick={() => setIsSuffixDropdownOpen(!isSuffixDropdownOpen)}
                        >
                          <span className="block truncate">{suffix || 'None'}</span>
                          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                            {isSuffixDropdownOpen ? (
                              <ChevronUpIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                            ) : (
                              <ChevronDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                            )}
                          </span>
                        </button>
                        
                        {isSuffixDropdownOpen && (
                          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                            {suffixOptions.map((option) => (
                              <div
                                key={option}
                                className={`relative cursor-default select-none py-2 pl-3 pr-9 ${
                                  suffix === option ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                                }`}
                                onClick={() => {
                                  setSuffix(option);
                                  setIsSuffixDropdownOpen(false);
                                }}
                              >
                                {option || 'None'}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Location Input - Now typable with dropdown */}
                    <div className="sm:col-span-2">
                      <label htmlFor="location" className="block text-xs font-medium text-gray-700 mb-1">
                        Location
                      </label>
                      <div className="relative">
                        <input
                          id="location"
                          type="text"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="block w-full rounded-md border-0 py-3 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                          placeholder="e.g. Sydney"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 flex items-center pr-2"
                        onClick={() => setIsLocationDropdownOpen(!isLocationDropdownOpen)}
                      >
                          {isLocationDropdownOpen ? (
                            <ChevronUpIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                          ) : (
                            <ChevronDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                          )}
                      </button>
                      
                      {isLocationDropdownOpen && (
                        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                            {locationOptions.map((option) => (
                            <div
                              key={option}
                              className={`relative cursor-default select-none py-2 pl-3 pr-9 ${
                                location === option ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                              }`}
                              onClick={() => {
                                setLocation(option);
                                setIsLocationDropdownOpen(false);
                              }}
                            >
                              {option}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                 </div> {/* Closing tag for the input fields grid */}
                  
                 {/* Action Buttons - Moved below inputs and aligned right */}
                  <div className="flex justify-end space-x-2">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:bg-blue-400"
                    >
                      {isLoading ? 'Processing...' : 'Process Keyword'}
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkUpload}
                      className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-200 border border-gray-300 flex items-center"
                      title="Multiple keywords search"
                    >
                      <DocumentTextIcon className="h-5 w-5 mr-1" />
                      <span className="hidden sm:inline">Bulk</span>
                      <span className="sm:hidden">Bulk</span> {/* Ensure visible on small screens */}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsPanelOpen(!isSettingsPanelOpen);
                        if (!isSettingsPanelOpen) {
                          fetchPromptSettings(); // Fetch prompt settings when opening the panel
                        }
                      }}
                      className={`rounded-md px-3 py-2 text-sm font-medium shadow-sm border flex items-center ${
                        isSettingsPanelOpen 
                          ? 'bg-blue-50 text-blue-700 border-blue-300' 
                          : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                      }`}
                      title="Keyword Research Settings"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="hidden sm:inline">Settings</span>
                      <span className="sm:hidden">Settings</span> {/* Ensure visible on small screens */}
                    </button>
                  </div>
                </form>
              )}
              
              {/* Settings Panel */}
              {!showBulkUpload && isSettingsPanelOpen && (
                <div className="mt-6 border border-blue-200 rounded-lg bg-blue-50 p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-base font-medium text-blue-900">Keyword Research Settings</h3>
                    <button
                      type="button"
                      onClick={() => setIsSettingsPanelOpen(false)}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <span className="sr-only">Close</span>
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="space-y-6">
                    {/* Search Engine Settings */}
                    <div className="bg-white rounded-md shadow-sm p-4 border border-gray-200">
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Search Settings</h4>
                      
                      <div className="space-y-4">
                        {/* Search Engine Dropdown */}
                        <div>
                          <label htmlFor="search-engine-settings" className="block text-xs font-medium text-gray-700 mb-1">
                            Search Engine
                          </label>
                          <div className="relative">
                            <button
                              id="search-engine-settings"
                              type="button"
                              className="relative w-full cursor-default rounded-md bg-white py-2 pl-3 pr-10 text-left text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm"
                              onClick={() => setIsSearchEngineDropdownOpen(!isSearchEngineDropdownOpen)}
                            >
                              <span className="block truncate">
                                {searchEngineOptions.find(option => option.value === searchEngine)?.label || searchEngine}
                              </span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                {isSearchEngineDropdownOpen ? (
                                  <ChevronUpIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                                ) : (
                                  <ChevronDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                                )}
                              </span>
                            </button>
                            
                            {isSearchEngineDropdownOpen && (
                              <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                                {searchEngineOptions.map((option) => (
                                  <div
                                    key={option.value}
                                    className={`relative cursor-default select-none py-2 pl-3 pr-9 ${
                                      searchEngine === option.value ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                                    }`}
                                    onClick={() => {
                                      setSearchEngine(option.value);
                                      setIsSearchEngineDropdownOpen(false);
                                    }}
                                  >
                                    {option.label}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Prompt Settings */}
                    <div className="bg-white rounded-md shadow-sm p-4 border border-gray-200">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-sm font-medium text-gray-900">Prompt Settings</h4>
                        {isLoadingPrompt && (
                          <div className="flex items-center text-xs text-blue-600">
                            <ArrowPathIcon className="h-3 w-3 mr-1 animate-spin" />
                            Loading...
                          </div>
                        )}
                      </div>
                      
                      <p className="text-xs text-gray-500 mb-4">
                        These settings are used to customize the industry blog content generation for keyword research.
                        The information will be used in the system prompt for better content relevance and industry accuracy.
                      </p>
                      
                      {/* Target Customer Settings */}
                      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <h5 className="text-sm font-medium text-gray-900 mb-3">Target Customer</h5>
                        <div className="flex items-center space-x-4">
                          <label className="inline-flex items-center">
                            <input 
                              type="radio" 
                              name="blogTarget" 
                              value="customer_kr" 
                              checked={blogTarget === "customer_kr"} 
                              onChange={() => setBlogTarget("customer_kr")}
                              className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500" 
                            />
                            <span className="ml-2 text-sm text-gray-700">Customers</span>
                          </label>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          Blog content target customers.
                        </p>
                      </div>
                      
                      <div className="space-y-4">
                        {/* Prompt */}
                        <div>
                          <label htmlFor="prompt" className="block text-xs font-medium text-gray-700 mb-1">
                            Main System Prompt <span className="text-red-500">*</span>
                          </label>
                          <p className="text-xs text-gray-500 mb-2">
                            This is the primary instruction set that guides the AI in generating industry content for keyword research.
                            It should include specific guidelines for SEO optimization, industry terminology, content structure, and tone.
                          </p>
                          <textarea
                            id="prompt"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={8}
                            className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm"
                            placeholder="Enter the main system prompt for industry keyword research content generation. This is the primary instruction set that will guide the AI in creating industry-focused content with proper industry terminology and context."
                          />
                        </div>
                        
                        {/* Keyword Guideline */}
                        <div>
                          <label htmlFor="keyword-guideline" className="block text-xs font-medium text-gray-700 mb-1">
                            Keyword Guideline
                          </label>
                          <textarea
                            id="keyword-guideline"
                            value={keywordGuideline}
                            onChange={(e) => setKeywordGuideline(e.target.value)}
                            rows={4}
                            className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm"
                            placeholder="Enter guidelines specific to industry keyword usage and density for content generation. Include any specific industry terminology or keywords that should be prioritized."
                          />
                        </div>
                        
                        {/* Company Name */}
                        <div>
                          <label htmlFor="company-name" className="block text-xs font-medium text-gray-700 mb-1">
                            Company Name
                          </label>
                          <input
                            id="company-name"
                            type="text"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm"
                            placeholder="e.g. Company Name"
                          />
                        </div>
                        
                        {/* Company About */}
                        <div>
                          <label htmlFor="company-about" className="block text-xs font-medium text-gray-700 mb-1">
                            Company About
                          </label>
                          <textarea
                            id="company-about"
                            value={companyAbout}
                            onChange={(e) => setCompanyAbout(e.target.value)}
                            rows={3}
                            className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm"
                            placeholder="e.g. Leading company name and solutions provider across country"
                          />
                        </div>
                        
                        {/* Company Details */}
                        <div>
                          <label htmlFor="company-details" className="block text-xs font-medium text-gray-700 mb-1">
                            Company Details
                          </label>
                          <textarea
                            id="company-details"
                            value={companyDetails}
                            onChange={(e) => setCompanyDetails(e.target.value)}
                            rows={4}
                            className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm"
                            placeholder="company details"
                          />
                        </div>
                        
                        {/* Success/Error Messages */}
                        {promptSaved && (
                          <div className="p-2 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
                            Prompt settings saved successfully!
                          </div>
                        )}
                        
                        {promptError && (
                          <div className="p-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                            Error: {promptError}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Save Settings Button */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:bg-blue-400"
                      onClick={async () => {
                        try {
                          setIsLoadingPrompt(true);
                          setPromptError(null);
                          setPromptSaved(false);
                          
                          // Save company information to both targets (customer_kr and service_provider_kr)
                          // but only update the prompt for the currently selected target
                          const targets = ['customer_kr', 'service_provider_kr'];
                          
                          for (const target of targets) {
                            const response = await adminFetch(
                              getAdminUrl(ADMIN_API_CONFIG.endpoints.blogContentManager.saveSystemPrompt),
                              {
                                method: 'POST',
                                body: JSON.stringify({
                                  type: 'blog_content_keyword_research',
                                  prompt_for: target,
                                  company_name: companyName,
                                  company_about: companyAbout,
                                  company_details: companyDetails,
                                  // Only update prompt for the currently selected target
                                  prompt: target === (blogTarget || 'customer_kr') ? prompt : undefined,
                                  location: location, // Use the current location from the search form
                                  keyword_guideline: keywordGuideline,
                                })
                              }
                            );
                            
                            const data = await response.json();
                            
                            if (!data.success) {
                              throw new Error(data.message || `Failed to save settings for ${target}`);
                            }
                          }
                          
                          setPromptSaved(true);
                          // Close the settings panel after a short delay
                          setTimeout(() => {
                            setIsSettingsPanelOpen(false);
                          }, 1000);
                        } catch (err: any) {
                          console.error('Error saving prompt settings:', err);
                          setPromptError(err.message || 'Failed to save prompt settings');
                        } finally {
                          setIsLoadingPrompt(false);
                        }
                      }}
                      disabled={isLoadingPrompt}
                    >
                      {isLoadingPrompt ? (
                        <>
                          <ArrowPathIcon className="h-4 w-4 mr-1.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Settings'
                      )}
                    </button>
                  </div>
                </div>
              )}
              
              {/* Bulk Upload Form */}
              {showBulkUpload && (
                <div className="mt-2">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-base font-medium text-gray-900">Bulk Keyword Research</h3>
                    <button
                      type="button"
                      onClick={() => setShowBulkUpload(false)}
                      className="text-gray-400 hover:text-gray-500"
                    >
                      <span className="sr-only">Close</span>
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="mb-4">
                    <textarea
                      ref={bulkUploadRef}
                      value={bulkKeywords}
                      onChange={(e) => setBulkKeywords(e.target.value)}
                      placeholder="Enter one keyword per line, for example:
keyword 1
keyword 2
keyword 3"
                      className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm"
                      rows={6}
                    ></textarea>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      <p>Location: <strong>{location}</strong> | Search Engine: <strong>{searchEngineOptions.find(option => option.value === searchEngine)?.label}</strong></p>
                      {quota && (
                        <p className="mt-1">
                          Daily API Quota: <strong>{quota.remaining}</strong> searches remaining
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-3">
                      <button
                        type="button"
                        onClick={() => setShowBulkUpload(false)}
                        className="rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm border border-gray-300 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={processBulkKeywords}
                        disabled={bulkProgress.inProgress || !bulkKeywords.trim()}
                        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:bg-blue-400"
                      >
                        {bulkProgress.inProgress ? 'Processing...' : 'Start Bulk Processing'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Removed inline bulk processing UI */}
                </div>
              )}
              
              {success && (
                <div className="mt-4 p-4 bg-green-50 rounded-md border border-green-200">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <CheckIcon className="h-5 w-5 text-green-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-green-800">Success</h3>
                      <div className="mt-2 text-sm text-green-700">
                        <p>{success}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="mt-4 p-4 bg-red-50 rounded-md border border-red-200">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <ExclamationCircleIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">Error</h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                        {error.includes('Network connectivity') && (
                          <div className="mt-2 p-2 bg-red-100 rounded text-xs">
                            <p className="font-semibold">Troubleshooting steps:</p>
                            <ol className="list-decimal pl-4 mt-1 space-y-1">
                              <li>Check your internet connection</li>
                              <li>Verify that you can access www.googleapis.com</li>
                              <li>Check if your firewall or proxy is blocking the connection</li>
                              <li>Try the <a href="/api/admin/keyword_research/test_connectivity.php" target="_blank" className="text-blue-600 underline">connectivity test tool</a></li>
                            </ol>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Keywords List Section */}
              {isTableLoading && (
                <div className="mt-8 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 border-4 border-blue-600 rounded-full border-t-transparent animate-spin mb-4"></div>
                  {searchProgress && !isBlogGenerating && (
                    <div className="text-sm text-gray-700 bg-blue-50 px-4 py-2 rounded-md border border-blue-200">
                      {searchProgress}
                    </div>
                  )}
                </div>
              )}
              
              {!isTableLoading && (
                <div className="mt-8">
                  {/* Filters Section */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
                    {/* Top Row: Search, Status, Sort, Groups */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                      {/* Search Input */}
                      <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search posts..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        />
                      </div>

                      {/* Status Filter */}
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="all">All Status</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                      </select>

                      {/* Sort Filter */}
                      <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value)}
                        className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="newest">Sort: Newest</option>
                        <option value="oldest">Sort: Oldest</option>
                        <option value="title_asc">Sort: Title A-Z</option>
                        <option value="title_desc">Sort: Title Z-A</option>
                      </select>

                      {/* Groups Filter */}
                      <select
                        value={groupFilter}
                        onChange={(e) => setGroupFilter(e.target.value)}
                        className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="all">All Groups</option>
                      </select>
                    </div>

                    {/* Bottom Row: Checkbox and Date Filter */}
                    <div className="flex flex-wrap items-center gap-4">
                      {/* Show Only Rewritten Posts Checkbox */}
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={showOnlyRewritten}
                          onChange={(e) => setShowOnlyRewritten(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                        />
                        <span className="ml-2 text-sm text-gray-700">Show only rewritten posts</span>
                      </label>

                      {/* Date Filter */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">Filter by Creation Date</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setDateFilter('all_time')}
                            className={`px-3 py-1 text-xs rounded-md ${
                              dateFilter === 'all_time'
                                ? 'bg-blue-100 text-blue-700 font-medium'
                                : 'bg-white text-gray-600 border border-gray-300'
                            }`}
                          >
                            All Time
                          </button>
                          <button
                            onClick={() => setDateFilter('custom')}
                            className={`px-3 py-1 text-xs rounded-md ${
                              dateFilter === 'custom'
                                ? 'bg-blue-100 text-blue-700 font-medium'
                                : 'bg-white text-gray-600 border border-gray-300'
                            }`}
                          >
                            Custom Range
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Active Filters Tags */}
                    {showOnlyRewritten && (
                      <div className="mt-3 flex gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-800">
                          Rewritten
                          <button
                            onClick={() => setShowOnlyRewritten(false)}
                            className="ml-1 hover:text-green-600"
                          >
                            <XMarkIcon className="h-3 w-3" />
                          </button>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Results Count */}
                  <div className="mb-4 text-sm text-gray-600">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} results
                  </div>
                  
                  {isSearching ? (
                    <div className="mt-4 p-4 bg-blue-50 rounded-md text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-10 h-10 border-4 border-blue-600 rounded-full border-t-transparent animate-spin mb-3"></div>
                        <p className="text-sm text-blue-700">
                          {searchProgress || 'Searching for keywords...'}
                        </p>
                      </div>
                    </div>
                  ) : !searchResults || searchResults.length === 0 ? (
                    <div className="mt-4 p-4 bg-gray-50 rounded-md text-center">
                      <p className="text-sm text-gray-500">
                        {isSearched ? 'No keyword research results found' : 'Search for keywords to see results'}
                      </p>
                    </div>
                  ) : (
                  <div className="mt-4 flow-root"> {/* Use flow-root for overflow */}
                    {/* Bulk actions bar - Added responsiveness */}
                    {selectedKeywords.length > 0 && (
                      <div className="bg-blue-50 p-3 border-b border-blue-200 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0">
                        <span className="text-sm text-blue-700">
                          {selectedKeywords.length} keyword{selectedKeywords.length > 1 ? 's' : ''} selected
                        </span>
                        <button
                          onClick={handleBulkDelete}
                          disabled={isBulkDeleting}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-400"
                        >
                          {isBulkDeleting ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Deleting...
                            </>
                          ) : (
                            <>Delete Selected</>
                          )}
                        </button>
                      </div>
                    )}
                    {/* Use overflow-x-auto for smaller screens where table might still be wide */}
                    <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8"> 
                      <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                        <table className="min-w-full divide-y divide-gray-300">
                          {/* Hide header on small screens, show on md and up */}
                          <thead className="bg-gray-50 hidden md:table-header-group">
                            <tr>
                              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 w-12">
                                <input 
                                  type="checkbox"
                                  checked={selectedKeywords.length > 0 && searchResults && selectedKeywords.length === searchResults.length}
                                  onChange={(e) => {
                                    if (e.target.checked && searchResults) {
                                      setSelectedKeywords(searchResults.map(result => result.id));
                                    } else {
                                      setSelectedKeywords([]);
                                    }
                                  }}
                                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                                />
                              </th>
                              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                                TITLE
                              </th>
                              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                STATUS
                              </th>
                              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                CREATED
                              </th>
                              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                PUBLISHED
                              </th>
                              <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                                ACTIONS
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white">
                            {searchResults && searchResults.map((result) => {
                              const blogTitle = result.blog_title?.trim() || ''
                              const keywordText = result.keyword?.trim() || ''
                              const primaryTitle = blogTitle || keywordText || '—'
                              const showKeywordSubtitle = false

                              return (
                              <tr key={result.id} className="hover:bg-gray-50">
                                {/* Checkbox cell */}
                                <td className="py-4 pl-4 pr-3 text-sm sm:pl-6">
                                  <input 
                                    type="checkbox"
                                    checked={selectedKeywords.includes(result.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedKeywords([...selectedKeywords, result.id]);
                                      } else {
                                        setSelectedKeywords(selectedKeywords.filter(id => id !== result.id));
                                      }
                                    }}
                                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                                  />
                                </td>
                                
                                {/* Title cell */}
                                <td className="py-4 pl-4 pr-3 text-sm sm:pl-6">
                                  <Link 
                                    href={`${baseAdminPath.replace(/\/$/, '')}/${result.id}`}
                                    className="block text-gray-900 hover:text-blue-600"
                                  >
                                    <span className="font-semibold">
                                      {primaryTitle}
                                    </span>
                                    {/* Show keyword as a small gray subtitle on small screens */}
                                    <span className="mt-0.5 block text-xs font-medium text-gray-500 md:hidden">
                                      {keywordText}
                                    </span>
                                  </Link>
                                </td>
                                
                                {/* Status cell */}
                                <td className="px-3 py-4 text-sm">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    result.blog_status === 'published' 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {result.blog_status || 'draft'}
                                  </span>
                                </td>
                                
                                {/* Created cell */}
                                <td className="px-3 py-4 text-sm text-gray-500">
                                  <div className="flex items-center text-xs text-gray-500">
                                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    {new Date(result.created_at).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric', 
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </div>
                                </td>
                                
                                {/* Published cell */}
                                <td className="px-3 py-4 text-sm text-gray-500">
                                  <div className="flex items-center text-xs text-gray-500">
                                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {result.blog_published_at 
                                      ? new Date(result.blog_published_at).toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: 'numeric', 
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })
                                      : '-'
                                    }
                                  </div>
                                </td>
                                
                                {/* Actions cell */}
                                <td className="relative py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                  <div className="flex items-center justify-end gap-2">
                                    {/* Edit Icon */}
                                    <Link
                                      href={`${baseAdminPath.replace(/\/$/, '')}/${result.id}`}
                                      className="text-blue-600 hover:text-blue-900"
                                      title="Edit"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </Link>
                                    
                                    {/* Copy Icon */}
                                    <button
                                      onClick={() => {
                                        if (result.blog_slug) {
                                          const publicBaseUrl = (process.env.NEXT_PUBLIC_DOMAIN || 'https://www.example.com').replace(/\/$/, '');
                                          navigator.clipboard.writeText(`${publicBaseUrl}/blog/${result.blog_slug}`);
                                          toast.success('Link copied to clipboard!');
                                        }
                                      }}
                                      className="text-gray-600 hover:text-gray-900"
                                      title="Copy link"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                      </svg>
                                    </button>
                                    
                                    {/* Delete Icon */}
                                    <button
                                      onClick={() => handleDelete(result.id)}
                                      disabled={isDeleting === result.id}
                                      className="text-red-600 hover:text-red-900 focus:outline-none"
                                      title="Delete"
                                    >
                                      {isDeleting === result.id ? (
                                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                      ) : (
                                        <TrashIcon className="h-5 w-5" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              )})}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    
                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                        {/* Mobile Pagination */}
                        <div className="flex-1 flex justify-between sm:hidden">
                          <button
                            onClick={handlePrevPage}
                            disabled={currentPage === 1}
                            className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                              currentPage === 1
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            Previous
                          </button>
                          <button
                            onClick={handleNextPage}
                            disabled={currentPage === totalPages}
                            className={`ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                              currentPage === totalPages
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            Next
                          </button>
                        </div>
                        {/* Desktop Pagination */}
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm text-gray-700">
                              Showing <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> to{' '}
                              <span className="font-medium">{Math.min(currentPage * itemsPerPage, totalItems)}</span> of{' '}
                              <span className="font-medium">{totalItems}</span> results
                            </p>
                          </div>
                          <div>
                            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                              <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${
                                  currentPage === 1
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : 'text-gray-500 hover:bg-gray-50'
                                }`}
                              >
                                <span className="sr-only">First</span>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414zm-6 0a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L5.414 10l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                              <button
                                onClick={handlePrevPage}
                                disabled={currentPage === 1}
                                className={`relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium ${
                                  currentPage === 1
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : 'text-gray-500 hover:bg-gray-50'
                                }`}
                              >
                                <span className="sr-only">Previous</span>
                                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </button>
                              
                              {/* Page Numbers */}
                              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                                let pageNumber;
                                
                                if (totalPages <= 5) {
                                  pageNumber = i + 1;
                                } else if (currentPage <= 3) {
                                  pageNumber = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                  pageNumber = totalPages - 4 + i;
                                } else {
                                  pageNumber = currentPage - 2 + i;
                                }
                                
                                return (
                                  <button
                                    key={pageNumber}
                                    onClick={() => handleGoToPage(pageNumber)}
                                    className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium ${
                                      currentPage === pageNumber
                                        ? 'bg-blue-50 border-blue-500 text-blue-600 z-10'
                                        : 'bg-white text-gray-500 hover:bg-gray-50'
                                    }`}
                                  >
                                    {pageNumber}
                                  </button>
                                );
                              })}
                              
                              <button
                                onClick={handleNextPage}
                                disabled={currentPage === totalPages}
                                className={`relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium ${
                                  currentPage === totalPages
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : 'text-gray-500 hover:bg-gray-50'
                                }`}
                              >
                                <span className="sr-only">Next</span>
                                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleGoToPage(totalPages)}
                                disabled={currentPage === totalPages}
                                className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                                  currentPage === totalPages
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : 'text-gray-500 hover:bg-gray-50'
                                }`}
                              >
                                <span className="sr-only">Last</span>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M4.293 15.707a1 1 0 001.414 0l5-5a1 1 0 000-1.414l-5-5a1 1 0 00-1.414 1.414L8.586 10l-4.293 4.293a1 1 0 000 1.414zm6 0a1 1 0 001.414 0l5-5a1 1 0 000-1.414l-5-5a1 1 0 00-1.414 1.414L5.414 10l4.293 4.293a1 1 0 000 1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </nav>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
    </div>
  )
}