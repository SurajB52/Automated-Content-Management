'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import BlogEditor, { BlogEditorHandles } from '@/components/blog/BlogEditor'
import toast, { Toaster } from 'react-hot-toast'
import { 
  ArrowLeft as ArrowLeftIcon, 
  ExternalLink as ArrowTopRightOnSquareIcon, 
  Check as CheckIcon, 
  X as XMarkIcon,
  Clipboard as ClipboardDocumentIcon,
  ClipboardCheck as ClipboardDocumentCheckIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  Menu as Bars3Icon, // Import hamburger icon
  XCircle as XCircleIcon, // Import close icon
  Pencil as PencilIcon // Add pencil icon for editing
} from 'lucide-react'
import { getAdminUrl, adminFetch, ADMIN_API_CONFIG } from '@/config/adminApi'
import RightSideTabs from '@/components/admin/keyword-research-old/RightSideTabs'
import ImageGallery from '@/components/admin/keyword-research-old/ImageGallery'

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  displayLink: string;
}

interface PhraseData {
  phrase: string;
  frequency: number;
  quality_score?: number;
  // Header presence
  in_h1?: boolean;
  in_h2?: boolean;
  in_h3?: boolean;
  // Hierarchy data
  hierarchy_levels?: number[];
  common_parent_header?: string;
  // Existing fields
  in_headers?: boolean;
  in_title?: boolean;
  h1_frequency?: number;
  h2_frequency?: number;
  title_frequency?: number;
}

interface KeywordData {
  id: string;
  keyword: string;
  location: string;
  created_by: string;
  created_at: string;
  blog_generated: number;
  blog_id: number | null;
  search_results: SearchResult[];
  extracted_keywords: {
    single_words: [string, number][];
    phrases: PhraseData[];
  };
  custom_keywords?: {
    single_words: string[];
    phrases: string[];
  };
}

interface BlogPost {
  id: number;
  title: string;
  content: string;
  featured_image: string;
  featured_image_alt: string;
  status: 'draft' | 'published' | 'scheduled';
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  rich_schema: string | null;
  og_image: string | null;
  additional_images?: {
    id: number;
    image_url: string;
    alt_text: string;
    caption?: string;
  }[];
  quotes?: {
    id: number;
    quote_text: string;
    author?: string;
    source?: string;
  }[];
  blog_prompt?: string;
  blog_for?: string;
  matching_score?: number;
  slug?: string;
  scheduled_publish?: string;
  blog_group_id?: number | null; // Add blog_group_id
}

interface KeywordApiResponse {
  success?: boolean;
  status?: string;
  data?: KeywordData;
  message?: string;
  error?: string;
}

interface PromptSettingsApiResponse {
  success?: boolean;
  data?: {
    company_name?: string;
    company_about?: string;
    company_details?: string;
    location?: string;
    prompt?: string;
  };
  message?: string;
}

interface BlogPostApiResponse {
  success?: boolean;
  data?: BlogPost;
  message?: string;
}

// Add this function to remove highlight spans from content
const removeHighlightSpans = (content: string): string => {
  if (!content) return '';
  
  // Create a temporary div to handle HTML content
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  
  // Find all highlighted spans
  const highlights = tempDiv.querySelectorAll('.keyword-highlight');
  
  // Replace each highlight with its text content
  highlights.forEach(span => {
    const parent = span.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(span.textContent || ''), span);
    }
  });
  
  // Return clean content
  return tempDiv.innerHTML;
};

// Define BlockItem component
interface BlockItemProps {
  title: string;
  icon: React.ReactNode;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
}

const BlockItem: React.FC<BlockItemProps> = ({ title, icon, onDragStart }) => {
  return (
    <div 
      className="flex items-center p-3.5 bg-white border-2 border-gray-200 rounded-lg shadow-sm cursor-move hover:shadow-md hover:border-blue-400 hover:scale-[1.02] transition-all duration-200 group"
      draggable
      onDragStart={onDragStart}
    >
      <div className="mr-3 transform group-hover:scale-110 transition-transform duration-200">{icon}</div>
      <span className="text-sm font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">{title}</span>
      <svg className="ml-auto h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    </div>
  );
};

function KeywordDetail() {
  // Simple adapter so we can call notify(type)
  const notify = (message: string, type: 'success'|'error'|'info' = 'info') => {
    if (type === 'success') return toast.success(message)
    if (type === 'error') return toast.error(message)
    return toast(message)
  }
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const token = params?.token as string
  // Use env-based public domain for any absolute URLs rendered in UI
  const publicBaseUrl = (process.env.NEXT_PUBLIC_DOMAIN || 'https://www.example.com').replace(/\/$/, '')
  // Collapsible: Keyword Match section (default expanded)
  const [isKeywordMatchExpanded, setIsKeywordMatchExpanded] = useState(true)
  const [keywordData, setKeywordData] = useState<KeywordData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('phrases')
  const [copiedPhrasesState, setCopiedPhrasesState] = useState(false)
  const [copiedWordsState, setCopiedWordsState] = useState(false)
  const [copyTimeout, setCopyTimeout] = useState<NodeJS.Timeout | null>(null)
  const [isBlogGenerating, setIsBlogGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState<string | null>(null)
  const [blogPost, setBlogPost] = useState<BlogPost | null>(null)
  const [showPromptSection, setShowPromptSection] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [companyInfo, setCompanyInfo] = useState({
    company_name: '',
    company_about: '',
    company_details: '',
    location: ''
  })
  const [newKeyword, setNewKeyword] = useState('')
  const [newPhrase, setNewPhrase] = useState('')
  const [blogMatchingScore, setBlogMatchingScore] = useState<number | null>(null)
  const [highlightedContent, setHighlightedContent] = useState<string>('')
  // Add new state variables for regeneration
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [regenerationOverlay, setRegenerationOverlay] = useState(false)

  // State for collapsible sidebars
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false); // Default closed on mobile
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false); // Default closed on mobile

  // Add state for left sidebar tabs
  const [leftSidebarTab, setLeftSidebarTab] = useState('serp');
  
  // Track content changes
  const [currentBlogContent, setCurrentBlogContent] = useState<string>('');
  const [currentBlogTitle, setCurrentBlogTitle] = useState<string>('');
  const [initialSetupComplete, setInitialSetupComplete] = useState(false);

  // Add state for scheduling
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<string>('');

  // Add ref for BlogEditor
  const blogEditorRef = useRef<BlogEditorHandles>(null);

  // Add state for collapsible blog prompt
  const [isBlogPromptExpanded, setIsBlogPromptExpanded] = useState(false);

  const [selectedBlogGroupId, setSelectedBlogGroupId] = useState<number | null>(null); // Add state for selected blog group ID

  // Add state variables for slug editing
  const [isSlugEditing, setIsSlugEditing] = useState(false);
  const [slugValue, setSlugValue] = useState('');
  const [isSlugSaving, setIsSlugSaving] = useState(false);

  useEffect(() => {
    if (id) {
      fetchKeywordData(id as string);
    }
  }, [id]);

  const fetchKeywordData = async (keywordId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const keywordResponse = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.get, { id: keywordId })
      );
      const keywordText = await keywordResponse.text();
      let keywordData: unknown = null;
      try {
        keywordData = JSON.parse(keywordText);
      } catch (e: unknown) {
        const statusInfo = `${keywordResponse.status} ${keywordResponse.statusText}`;
        setError(`Invalid response (${statusInfo}): ${keywordText.slice(0, 180)}`);
        return;
      }
      const keywordResponseData = keywordData as KeywordApiResponse;
      const ok = (keywordResponseData && (keywordResponseData.success === true || keywordResponseData.status === 'success'));
      
      if (ok && keywordResponseData.data) {
        // Log the data to check if custom_keywords is present
        console.log('Keyword data:', keywordResponseData.data);
        
        setKeywordData(keywordResponseData.data);
        fetchPromptSettings();

        // If there are no custom_keywords saved yet, use the extracted keywords
        if (!keywordResponseData.data.custom_keywords && keywordResponseData.data.extracted_keywords) {
          saveCustomKeywords(keywordResponseData.data.extracted_keywords, keywordId);
        }
      } else {
        const statusInfo = `${keywordResponse.status} ${keywordResponse.statusText}`;
        setError(keywordResponseData.message || keywordResponseData.error || `Failed to fetch keyword data (${statusInfo})`);
      }
    } catch (err: unknown) {
      console.error('Error fetching keyword data:', err);
      setError('Failed to fetch keyword data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const saveCustomKeywords = async (keywordsData: { single_words: [string, number][]; phrases: PhraseData[] }, keywordId: string) => {
    try {
      // Extract only the keyword strings from the data (always transform from extracted_keywords format)
      const dataToSave: { single_words: string[]; phrases: string[] } = {
        single_words: keywordsData.single_words.map((item: [string, number]) => item[0]),
        phrases: keywordsData.phrases.map((item: PhraseData) => item.phrase)
      };
      
      const response = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.saveCustomKeywords),
        {
          method: 'POST',
          body: JSON.stringify({
            id: parseInt(keywordId, 10),
            custom_keywords: dataToSave
          })
        }
      );
      
      // Safe JSON parsing
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`API returned non-JSON response: ${text.slice(0, 100)}`);
      }
      const data = await response.json();
      
      if (data.success || data.status === 'success') {
        // Update the keywordData to reflect the saved custom keywords
        setKeywordData(prevData => {
          if (!prevData) return null;
          return {
            ...prevData,
            custom_keywords: dataToSave as { single_words: string[]; phrases: string[] }
          };
        });
        console.log('Custom keywords saved successfully');
      } else {
        console.error('Failed to save custom keywords:', data.message);
      }
    } catch (err) {
      console.error('Error saving custom keywords:', err);
    } finally {
    }
  };

  const fetchPromptSettings = async () => {
    try {
      const response = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.blogContentManager.getSystemPrompt),
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'blog_content_keyword_research',
            prompt_for: 'customer_kr'
          })
        }
      );
      
      const ct = response.headers.get('content-type') || '';
      let data: PromptSettingsApiResponse = {};
      if (ct.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Invalid response for prompt (${response.status} ${response.statusText}): ${text.slice(0, 200)}`);
      }
      
      if (data.success && data.data) {
        const promptData = data as PromptSettingsApiResponse & { data: { company_name?: string; company_about?: string; company_details?: string; location?: string; prompt?: string } };
        setCompanyInfo({
          company_name: promptData.data.company_name || '',
          company_about: promptData.data.company_about || '',
          company_details: promptData.data.company_details || '',
          location: promptData.data.location || ''
        });
      }
    } catch (err) {
      console.error('Error fetching prompt settings:', err);
    }
  };

  useEffect(() => {
    fetchPromptSettings();
  }, []);

  const updateBlogGeneratedStatus = async (status: number) => {
    if (!keywordData || !id) return;
    
    try {
      const response = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.updateBlogStatus),
        {
          method: 'POST',
          body: JSON.stringify({
            id: id,
            blog_generated: status
          })
        }
      );
      
      // Safe JSON parsing
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`API returned non-JSON response: ${text.slice(0, 100)}`);
      }
      const data = await response.json();
      
      if (data.success) {
        // Update the local state to reflect the change
        setKeywordData(prev => prev ? {...prev, blog_generated: status} : null);
      } else {
        throw new Error(data.message || 'Failed to update status');
      }
    } catch (err: unknown) {
      console.error('Error updating blog status:', err);
      alert('Failed to update blog generated status. Please try again.');
    } finally {
    }
  };
  
  const copyToClipboard = (text: string, type: 'phrases' | 'words') => {
    if (copyTimeout) {
      clearTimeout(copyTimeout);
    }
    
    navigator.clipboard.writeText(text).then(
      () => {
        if (type === 'phrases') {
          setCopiedPhrasesState(true);
        } else {
          setCopiedWordsState(true);
        }
        
        const timer = setTimeout(() => {
          if (type === 'phrases') {
            setCopiedPhrasesState(false);
          } else {
            setCopiedWordsState(false);
          }
        }, 2000);
        
        setCopyTimeout(timer);
      },
      (err) => {
        console.error('Could not copy text: ', err);
      }
    );
  };
  
  const handleCopyPhrases = () => {
    if (!keywordData?.extracted_keywords?.phrases) return;
    
    const phrasesText = keywordData.extracted_keywords.phrases
      .map(p => p.phrase)
      .join('\n');
      
    copyToClipboard(phrasesText, 'phrases');
  };
  
  const handleCopyWords = () => {
    if (!keywordData?.extracted_keywords?.single_words) return;
    
    const wordsText = keywordData.extracted_keywords.single_words
      .map(([word]) => word)
      .join('\n');
      
    copyToClipboard(wordsText, 'words');
  };

  // Function to handle blog generation
  const handleBlogGeneration = async () => {
    if (!keywordData) return;
    
    try {
      setIsBlogGenerating(true);
      setGenerationProgress('Starting blog generation...');
      
      const response = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.generateBlog),
        {
          method: 'POST',
          body: JSON.stringify({
            keyword_ids: [keywordData.id],
            target_type: 'blog_content_keyword_research',
            target_for: 'customer_kr',
            prompt: promptText // Send prompt with the generation request
          })
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || 'Failed to generate blog';
        } catch {
          errorMessage = `API Error (${response.status}): ${errorText.slice(0, 100)}`;
        }
        
        setGenerationProgress(`Error: ${errorMessage}`);
        setTimeout(() => {
          setGenerationProgress(null);
          setIsBlogGenerating(false);
        }, 5000);
        return;
      }
      
      // Safe JSON parsing
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const errorText = await response.text();
        setGenerationProgress(`Error: API returned non-JSON response`);
        setTimeout(() => {
          setGenerationProgress(null);
          setIsBlogGenerating(false);
        }, 5000);
        return;
      }
      const data = await response.json();
      
      if (!data.success) {
        setGenerationProgress(`Error: ${data.error || 'Failed to generate blog'}`);
        setTimeout(() => {
          setGenerationProgress(null);
          setIsBlogGenerating(false);
        }, 5000);
        return;
      }
      
      setGenerationProgress('Blog generated successfully!');
      
      // Update the local state with blog_generated status and blog_id from the response
      setKeywordData(prev => prev ? {
        ...prev, 
        blog_generated: 1,
        blog_id: data.data.blog_id
      } : null);
      
      // Fetch the complete blog post data
      if (data.data.blog_id) {
        await fetchBlogPost(data.data.blog_id);
      }
      
      // Show success message for 3 seconds, then clear
      setTimeout(() => {
        setGenerationProgress(null);
        setIsBlogGenerating(false);
      }, 3000);
    } catch (err: unknown) {
      console.error('Error generating blog:', err);
      setGenerationProgress(`Error: ${err instanceof Error ? err.message : 'Failed to generate blog'}`);
      
      setTimeout(() => {
        setGenerationProgress(null);
        setIsBlogGenerating(false);
      }, 5000);
    }
  };

  // Update useEffect to fetch blog post when keywordData changes
  useEffect(() => {
    if (keywordData?.blog_id) {
      fetchBlogPost(keywordData.blog_id);
    } else {
      // If there's no blog ID, immediately set loading to false
    }
  }, [keywordData?.blog_id]);

  const fetchBlogPost = async (blogId: number) => {
    try {
      const response = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.getBlogPost, { id: blogId.toString() })
      );
      
      // Safely parse JSON only when content-type is JSON
      const ct = response.headers.get('content-type') || '';
      let data: BlogPostApiResponse = {};
      if (ct.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Invalid response for blog (${response.status} ${response.statusText}): ${text.slice(0, 200)}`);
      }
      
      if (data.success && data.data) {
        const blogData = data as BlogPostApiResponse & { data: BlogPost };
        // Check if blog_prompt is empty/null and promptText is available
        const blogPromptToUse = blogData.data.blog_prompt || promptText;
        
        // If the blog doesn't have a prompt but we have a system prompt,
        // save the system prompt as the blog's prompt
        if (!blogData.data.blog_prompt && promptText && keywordData?.blog_id) {
          try {
            await saveBlogPrompt(blogId, promptText);
          } catch (err) {
            console.error('Error saving prompt to blog:', err);
          }
        }

        // Store the original clean content
        const originalContent = blogData.data.content;

        // Calculate matching score with the original content
        const matchingScore = keywordData ? calculateBlogMatchingScore(originalContent, blogData.data.title, keywordData) : 0;
        
        // Generate highlighted content for display only
        const highlightedContent = keywordData 
          ? highlightKeywords(originalContent, keywordData) 
          : originalContent;
        
        // Update highlighted content state for display
        setHighlightedContent(highlightedContent);
        setCurrentBlogContent(originalContent);
        setCurrentBlogTitle(blogData.data.title);
        
        // Set blog post data - keep original content in the blogPost state
        setBlogPost({
          id: blogData.data.id,
          title: blogData.data.title,
          content: originalContent, // Store original clean content here
          featured_image: blogData.data.featured_image || '',
          featured_image_alt: blogData.data.featured_image_alt || '',
          status: blogData.data.status || 'draft',
          seo_title: blogData.data.seo_title || null,
          seo_description: blogData.data.seo_description || null,
          seo_keywords: blogData.data.seo_keywords || null,
          rich_schema: blogData.data.rich_schema || null,
          og_image: blogData.data.og_image || null,
          additional_images: blogData.data.additional_images || [],
          quotes: blogData.data.quotes || [],
          blog_prompt: blogPromptToUse,
          blog_for: blogData.data.blog_for || 'customer',
          matching_score: matchingScore,
          slug: blogData.data.slug,
          blog_group_id: blogData.data.blog_group_id ?? null // Set blog_group_id
        });

        // Set matching score in state
        setBlogMatchingScore(matchingScore);
        setSelectedBlogGroupId(blogData.data.blog_group_id ?? null); // Initialize state from fetched blog post
      } else {
        console.error('Failed to fetch blog post:', data.message);
        setBlogPost(null);
        setSelectedBlogGroupId(null); // Reset group ID if fetch fails
      }
    } catch (err) {
      console.error('Error fetching blog post:', err);
      setBlogPost(null);
      setSelectedBlogGroupId(null); // Reset group ID on error
      setError(`An error occurred while fetching the blog post: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
    }
  };
  // Persist feature image change and update local state
  const handleFeatureImageUpdate = async (imageUrl: string, altText: string) => {
    if (!blogPost) return;
    try {
      const tId = toast.loading('Updating featured image...')
      const response = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.posts.update),
        {
          method: 'POST',
          body: JSON.stringify({
            id: blogPost.id,
            featured_image: imageUrl,
            featured_image_alt: altText,
          }),
          headers: { 'Content-Type': 'application/json' }
        }
      )

      const contentType = response.headers.get('content-type') || ''
      const okJson = contentType.includes('application/json')
      const result = okJson ? await response.json() : null

      if (response.ok && (!result || result.success === true || result.status === 'success')) {
        setBlogPost(prevPost => {
          if (!prevPost) return null
          return { ...prevPost, featured_image: imageUrl, featured_image_alt: altText }
        })
        toast.dismiss(tId)
        toast.success('Featured image saved')
      } else {
        console.error('Failed to persist featured image', result || (await response.text()))
        toast.dismiss(tId)
        toast.error('Failed to save featured image')
      }
    } catch (e) {
      console.error('Error updating featured image:', e)
      toast.error('Error updating featured image')
    }
  }

  // Add function to save blog prompt
  const saveBlogPrompt = async (blogId: number, promptText: string) => {
    try {
      const response = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.posts.update),
        {
          method: 'POST',
          body: JSON.stringify({
            id: blogId,
            blog_prompt: promptText
          })
        }
      );

      // Safe JSON parsing
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`API returned non-JSON response: ${text.slice(0, 100)}`);
      }
      const result = await response.json();

      if (!result.success) {
        console.error('Failed to save blog prompt:', result.message);
      } else {
        console.log('Blog prompt saved successfully');
      }
      return result;
    } catch (err) {
      console.error('Error saving blog prompt:', err);
      throw err;
    }
  };

  // Fix the handleSave function to use the admin api endpoint
  const handleSave = async (blogData: {
    title: string;
    content: string;
    featured_image: string;
    featured_image_alt: string;
    status: 'draft' | 'published' | 'scheduled';
    seo_title: string | null;
    seo_description: string | null;
    seo_keywords: string | null;
    rich_schema: string | null;
    og_image: string | null;
    blog_group_id: number | null; // Add blog_group_id here
  }) => {
    try {
      if (!blogPost) {
        toast.error('No blog post data available');
        return;
      }
      
      // Get the actual content without highlighting
      const editorContent = getCurrentEditorContent();
      if (!editorContent) {
        console.error('Failed to get editor content');
        toast.error('Could not retrieve content from editor');
        return;
      }
      
      // Remove highlight spans from content before saving to database
      const cleanContent = removeHighlightSpans(editorContent);
      
      // Get the title
      const title = getCurrentEditorTitle();
      if (!title) {
        console.error('Failed to get editor title');
        toast.error('Could not retrieve title from editor');
        return;
      }
      
      // Update current content state for local reference
      setCurrentBlogContent(cleanContent);
      setCurrentBlogTitle(title);
      
      const updateData = {
        id: blogPost.id,
        blog_prompt: blogPost.blog_prompt || promptText,
        blog_for: 'customer',
        ...blogData,
        content: cleanContent, // Save clean content to database
        title: title,
        blog_group_id: selectedBlogGroupId // Use state variable here
      };
      
      console.log('Saving blog data:', {
        id: blogPost.id,
        contentLength: cleanContent.length,
        titleLength: title.length,
        title: title,
        status: blogData.status,
        blog_group_id: selectedBlogGroupId // Log the state variable
      });
      
      // Only show saving toast for draft saves; publishing flow will handle its own toast
      if (blogData.status === 'draft') {
        notify('Saving changes...', 'info');
      }
      
      const response = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.posts.update),
        {
          method: 'POST',
          body: JSON.stringify(updateData),
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      // Check response status
      console.log('Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        notify(`Failed to update blog: ${response.status} ${response.statusText}`, 'error');
        return;
      }

      // Check content type before parsing JSON
      const contentType = response.headers.get('content-type');
      let result;
      
      if (contentType && contentType.includes('application/json')) {
        // Parse JSON response
        result = await response.json();
        console.log('Response data:', result);
      } else {
        // Handle non-JSON response (likely HTML error page)
        const text = await response.text();
        console.error('Received non-JSON response:', text);
        notify('Server returned an invalid response format. Please try again later.', 'error');
        return;
      }

      if (result.success) {
        // Update local state with clean content
        setBlogPost({
          ...blogPost,
          ...blogData,
          content: cleanContent, // Use clean content in state
          title: title,
          blog_prompt: blogPost.blog_prompt || promptText,
          blog_for: 'customer',
          status: blogData.status,
          blog_group_id: selectedBlogGroupId // Update state with group ID from state variable
        });
        
        // Re-highlight the content after saving (only for display in this page)
        const newHighlightedContent = highlightKeywords(cleanContent, keywordData);
        setHighlightedContent(newHighlightedContent);
        
        // Do not show success toast here; callers decide what to display to avoid duplicates
      } else {
        console.error('API returned error:', result);
        if (result.message?.includes('Unauthorized')) {
          notify('Session expired. Please log in again.', 'error');
          router.push('/admin/login');
        } else {
          notify(result.message || 'Failed to update blog', 'error');
        }
      }
    } catch (error) {
      console.error('Error updating blog:', error);
      notify(`Failed to update blog: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      if (error instanceof Error && error.message.includes('401')) {
        router.push('/admin/login');
      }
    }
  };

  // Update the Save Draft button onClick handler
  const handleSaveDraft = async () => {
    if (blogPost && blogEditorRef.current) {
      try {
        // Use the BlogEditor's saveDraft method which has access to current rich schema
        await blogEditorRef.current.saveDraft();
        // Clear any editor toasts and show a single confirmation
        toast.dismiss()
        toast.success('Draft saved')
      } catch (error) {
        console.error('Error saving draft:', error);
        toast.dismiss()
        toast.error('Failed to save draft');
      }
    } else {
      toast.error('No blog post available to save');
    }
  };

  // Update the Publish button onClick handler
  const handlePublish = async () => {
    if (blogPost && blogEditorRef.current) {
      try {
        // Save silently
        await blogEditorRef.current.saveDraft()
        // Publish
        await blogEditorRef.current.publish()
        // Dismiss any prior editor toasts and show a single success toast
        toast.dismiss()
        toast.success('Published')
      } catch (error) {
        console.error('Error publishing blog:', error);
        toast.dismiss()
        toast.error('Failed to publish blog')
      }
    } else {
      toast.error('No blog post available to publish');
    }
  };

  // Add content change handler
  const handleEditorContentChange = (content: string) => {
    setCurrentBlogContent(content);
  };

  // Update handleSavePrompt function
  const handleSavePrompt = async () => {
    if (!blogPost?.id) return;
    
    try {
      setSavingPrompt(true);
      
      // Use the update endpoint to save the prompt
      const result = await saveBlogPrompt(blogPost.id, promptText);
      
      if (result.success) {
        toast.success('Prompt saved successfully');
        
        // Update local state
        if (blogPost) {
          setBlogPost({
            ...blogPost,
            blog_prompt: promptText
          });
        }
      } else {
        toast.error(result.message || 'Failed to save prompt');
      }
    } catch (err) {
      console.error('Error saving prompt:', err);
      toast.error('Failed to save prompt');
    } finally {
      setSavingPrompt(false);
    }
  };

  // Update fetchBlogPrompt function
  const fetchBlogPrompt = async (blogId: number) => {
    try {
      // Get blog details which includes the prompt
      const response = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.getBlogPost, { id: blogId.toString() })
      );
      
      // Safe JSON parsing
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('API returned non-JSON response');
      }
      const data = await response.json();
      
      if (data.success && data.data && data.data.blog_prompt) {
        setPromptText(data.data.blog_prompt);
      } else {
        // If no blog-specific prompt, get system prompt
        const systemResponse = await adminFetch(
          getAdminUrl(ADMIN_API_CONFIG.endpoints.blogContentManager.getSystemPrompt),
          {
            method: 'POST',
            body: JSON.stringify({
              type: 'blog_content_keyword_research',
              prompt_for: 'customer_kr'
            })
          }
        );
        
        const systemData = await systemResponse.json();
        
        if (systemData.success && systemData.data.prompt) {
          setPromptText(systemData.data.prompt);
        }
      }
    } catch (err) {
      console.error('Error fetching prompt:', err);
    }
  };

  // Update useEffect to fetch blog-specific prompt when blog post changes
  useEffect(() => {
    if (blogPost?.id) {
      fetchBlogPrompt(blogPost.id);
    }
  }, [blogPost?.id]);

  const handleGenerateFromPrompt = async () => {
    if (!promptText.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    await handleBlogGeneration();
    setIsGenerating(false);
  };

  // Add regeneration function
  const handleRegenerateContent = async () => {
    if (!blogPost) {
      toast.error('No blog post data available');
      return;
    }

    const promptToUse = promptText || blogPost.blog_prompt;
    if (!promptToUse?.trim()) {
      toast.error('Please set a prompt first');
      return;
    }

    try {
      // Show regeneration overlay
      setIsRegenerating(true);
      setRegenerationOverlay(true);
      
      // First, save the prompt to the blog post if needed
      if (promptText && (!blogPost.blog_prompt || blogPost.blog_prompt !== promptText)) {
        try {
          await saveBlogPrompt(blogPost.id, promptText);
        } catch (err) {
          console.error('Error saving blog prompt before regeneration:', err);
          // Continue despite error
        }
      }
      
      // Call the API to regenerate the blog content
      const response = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.keywordResearch.generateBlog),
        {
          method: 'POST',
          body: JSON.stringify({
            keyword_ids: [keywordData?.id],
            target_type: 'blog_content_rewrite',
            target_for: blogPost.blog_for || 'customer',
            blog_ids: [blogPost.id]
          })
        }
      );
      
      // Safe JSON parsing
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        toast.error('Server error: Please check your connection');
        setIsRegenerating(false);
        setRegenerationOverlay(false);
        return;
      }
      const result = await response.json();
            
      if (result.success) {
        toast.success('Blog content regenerated successfully!');
        // Refresh the page to show updated content
        router.refresh();
        // Close overlay after regeneration completes
        setIsRegenerating(false);
        setRegenerationOverlay(false);
      } else {
        toast.error(result.error || 'Failed to regenerate content');
        setIsRegenerating(false);
        setRegenerationOverlay(false);
      }
    } catch (error) {
      console.error('Error regenerating content:', error);
      toast.error('Failed to regenerate content');
      setIsRegenerating(false);
      setRegenerationOverlay(false);
    }
  };

  // Result Item component
  const ResultItem = ({ result, index }: { result: SearchResult; index: number }) => {
    const [isExpanded, setIsExpanded] = useState(index === 0);
    const [showMore, setShowMore] = useState(false);
    const MAX_PHRASES_TO_SHOW = 10;
    
    // Find matching phrases from headers for this result
    const findRelevantPhrases = () => {
      if (!keywordData?.extracted_keywords?.phrases) return [];
      
      // Filter phrases that appear in headers
      const headerPhrases = keywordData.extracted_keywords.phrases
        .filter(phrase => phrase.in_h1 || phrase.in_h2 || phrase.in_h3);
      
      // Check if phrase is relevant to this result
      const relevantPhrases = headerPhrases.filter(phrase => {
        const lowerTitle = result.title.toLowerCase();
        const lowerSnippet = result.snippet.toLowerCase();
        const lowerPhrase = phrase.phrase.toLowerCase();
        
        return lowerTitle.includes(lowerPhrase) || lowerSnippet.includes(lowerPhrase);
      });
      
      // If we don't have any directly relevant phrases, return all header phrases
      const phrasesToUse = relevantPhrases.length > 0 ? relevantPhrases : headerPhrases;
      
      // Deduplicate phrases across header types and sort by quality score
      const uniquePhrases = Array.from(new Map(
        phrasesToUse.map(phrase => [phrase.phrase, phrase])
      ).values());
      
      return uniquePhrases.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));
    };
    
    const relevantPhrases = findRelevantPhrases();
    const hasMorePhrases = relevantPhrases.length > MAX_PHRASES_TO_SHOW;
    const phrasesToDisplay = showMore ? relevantPhrases : relevantPhrases.slice(0, MAX_PHRASES_TO_SHOW);
    
    return (
      <div className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors duration-150">
        <div className="flex items-start p-4">
          <div className="flex-shrink-0 mt-0.5 mr-3">
            <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm">
              <span className="text-sm font-bold">{index + 1}</span>
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <div 
                className="flex-1 flex items-start cursor-pointer group" 
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <h3 className="text-sm font-semibold text-gray-900 break-words mr-2 leading-snug group-hover:text-blue-600 transition-colors">
                  {result.title}
                </h3>
                <div className="flex-shrink-0 mt-0.5">
                  {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4 text-gray-500 group-hover:text-blue-600 transition-colors" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 text-gray-500 group-hover:text-blue-600 transition-colors" />
                  )}
                </div>
              </div>
              <a 
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                onClick={(e) => e.stopPropagation()}
                title="Open in new tab"
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
            </div>
            {/* Display URL */}
            <div className="mt-1 text-xs text-gray-500 truncate">
              {result.displayLink}
            </div>
          </div>
        </div>
        
        {isExpanded && (
          <div className="pl-12 pr-4 pb-4 animate-fadeIn">
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-lg p-3 border border-gray-200 shadow-sm">
              {relevantPhrases.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Keywords Found</div>
                  {phrasesToDisplay.map((phrase, idx) => (
                    <div key={`phrase-${idx}`} className="flex items-start py-2 px-2 bg-white rounded-md border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all">
                      <div className="flex flex-wrap gap-1.5 mr-3 mt-0.5">
                        {phrase.in_h1 && (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-bold bg-gradient-to-r from-green-500 to-green-600 text-white shadow-sm">H1</span>
                        )}
                        {phrase.in_h2 && (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm">H2</span>
                        )}
                        {phrase.in_h3 && (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-bold bg-gradient-to-r from-yellow-500 to-yellow-600 text-white shadow-sm">H3</span>
                        )}
                      </div>
                      <span className="flex-1 text-sm text-gray-900 font-medium leading-relaxed">{phrase.phrase}</span>
                    </div>
                  ))}
                  
                  {hasMorePhrases && (
                    <div className="pt-2 text-center">
                      <button 
                        onClick={() => setShowMore(!showMore)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-md transition-colors"
                      >
                        {showMore ? (
                          <>
                            <ChevronDownIcon className="h-3 w-3 inline mr-1 rotate-180" />
                            Show less
                          </>
                        ) : (
                          <>
                            <ChevronDownIcon className="h-3 w-3 inline mr-1" />
                            Show {relevantPhrases.length - MAX_PHRASES_TO_SHOW} more
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500 italic text-center py-3">
                  No relevant header phrases available for this result.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const PresenceIndicator = ({ value }: { value?: boolean }) => (
    <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full transition-all ${
      value 
        ? 'bg-green-100 text-green-600 ring-1 ring-green-200' 
        : 'bg-red-50 text-red-500 ring-1 ring-red-100'
    }`}>
      {value ? (
        <CheckIcon className="h-3 w-3 font-bold" strokeWidth={3} />
      ) : (
        <XMarkIcon className="h-3 w-3 font-bold" strokeWidth={3} />
      )}
    </span>
  );

  const getQualityColor = (score: number) => {
    if (score >= 8) return 'text-green-500';
    if (score >= 6) return 'text-yellow-500';
    return 'text-red-500';
  };

  // Add new CircularProgress component
  const CircularProgress = ({ score }: { score: number }) => {
    const radius = 14;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 10) * circumference;
    
    // Determine colors based on score
    const getScoreColor = () => {
      if (score >= 8) return { stroke: '#10b981', bg: '#d1fae5', text: '#059669' }; // green
      if (score >= 6) return { stroke: '#f59e0b', bg: '#fef3c7', text: '#d97706' }; // yellow/amber
      return { stroke: '#ef4444', bg: '#fee2e2', text: '#dc2626' }; // red
    };
    
    const colors = getScoreColor();

    return (
      <div className="relative inline-flex items-center justify-center">
        <svg className="transform -rotate-90 w-9 h-9" viewBox="0 0 36 36">
          {/* Background circle */}
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="transparent"
            stroke={colors.bg}
            strokeWidth="3"
          />
          {/* Progress circle */}
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="transparent"
            stroke={colors.stroke}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
        <span 
          className="absolute text-xs font-bold"
          style={{ color: colors.text }}
        >
          {score.toFixed(1)}
        </span>
      </div>
    );
  };

  // Function to remove a keyword
  const removeKeyword = (index: number) => {
    if (!keywordData?.custom_keywords?.single_words) return;
    
    const newSingleWords = [...keywordData.custom_keywords.single_words];
    newSingleWords.splice(index, 1);
    
    const updatedKeywords = {
      ...keywordData.custom_keywords,
      single_words: newSingleWords
    };
    
    setKeywordData(prevData => {
      if (!prevData) return null;
      return {
        ...prevData,
        custom_keywords: updatedKeywords
      };
    });
  };

  // Function to remove a phrase
  const removePhrase = (index: number) => {
    if (!keywordData?.custom_keywords?.phrases) return;
    
    const newPhrases = [...keywordData.custom_keywords.phrases];
    newPhrases.splice(index, 1);
    
    const updatedKeywords = {
      ...keywordData.custom_keywords,
      phrases: newPhrases
    };
    
    setKeywordData(prevData => {
      if (!prevData) return null;
      return {
        ...prevData,
        custom_keywords: updatedKeywords
      };
    });
  };

  // Function to add a new keyword
  const addKeyword = () => {
    if (!newKeyword.trim() || !keywordData?.custom_keywords) return;
    
    const updatedKeywords = {
      ...keywordData.custom_keywords,
      single_words: [
        ...(keywordData.custom_keywords.single_words || []),
        newKeyword.trim()
      ]
    };
    
    setKeywordData(prevData => {
      if (!prevData) return null;
      return {
        ...prevData,
        custom_keywords: updatedKeywords
      };
    });
    
    setNewKeyword(''); // Clear the input
  };

  // Function to add a new phrase
  const addPhrase = () => {
    if (!newPhrase.trim() || !keywordData?.custom_keywords) return;
    
    const updatedKeywords = {
      ...keywordData.custom_keywords,
      phrases: [
        ...(keywordData.custom_keywords.phrases || []),
        newPhrase.trim()
      ]
    };
    
    setKeywordData(prevData => {
      if (!prevData) return null;
      return {
        ...prevData,
        custom_keywords: updatedKeywords
      };
    });
    
    setNewPhrase(''); // Clear the input
  };

  // Add the scoring function
  const calculateBlogMatchingScore = (blogContent: string, title: string, keywordData: KeywordData): number => {
    if (!blogContent || !keywordData?.extracted_keywords) return 0;

    const combinedContent = (title + ' ' + blogContent).toLowerCase();
    let totalScore = 0;
    let maxPossibleScore = 0;

    // Score for phrases (50% weight)
    if (keywordData.extracted_keywords.phrases) {
      const phraseWeights = {
        high: 2,    // Reduced from 3 to 2
        medium: 1.5,  // Reduced from 2 to 1.5
        low: 1
      };

      keywordData.extracted_keywords.phrases.forEach(phrase => {
        const phraseText = phrase.phrase.toLowerCase();
        const matches = (combinedContent.match(new RegExp(phraseText, 'g')) || []).length;
        
        let weight = phraseWeights.low;
        if (phrase.quality_score && phrase.quality_score >= 7) { // Reduced from 8 to 7
          weight = phraseWeights.high;
        } else if (phrase.quality_score && phrase.quality_score >= 5) { // Reduced from 6 to 5
          weight = phraseWeights.medium;
        }

        // Reduced header bonus from 1.5 to 1.25
        if (phrase.in_h1 || phrase.in_h2 || phrase.in_h3) {
          weight *= 1.25;
        }

        // Give partial credit even for no matches
        totalScore += matches > 0 ? weight : (weight * 0.25); // Added 25% partial credit
        maxPossibleScore += weight;
      });
    }

    // Score for single words (50% weight - increased from 40%)
    if (keywordData.extracted_keywords.single_words) {
      keywordData.extracted_keywords.single_words.forEach(([word, frequency]) => {
        const wordText = word.toLowerCase();
        const matches = (combinedContent.match(new RegExp(`\\b${wordText}\\b`, 'g')) || []).length;
        
        const weight = Math.min(frequency, 3); // Reduced cap from 5 to 3
        // Give partial credit for single words too
        totalScore += matches > 0 ? weight : (weight * 0.25);
        maxPossibleScore += weight;
      });
    }

    // Add base score of 15% to make it more lenient
    const baseScore = 15;
    const calculatedScore = (totalScore / maxPossibleScore) * 100;
    const finalScore = Math.min(baseScore + calculatedScore, 100);
    
    return Math.round(finalScore);
  };

  // Update useEffect to make sure blog content is highlighted when content or keyword data changes
  useEffect(() => {
    if (keywordData?.blog_id && blogPost?.content) {
      // Only update the highlighting if the blog content changes
      const highlighted = highlightKeywords(blogPost.content, keywordData);
      // Only update highlighted content if it's different
      if (highlighted !== highlightedContent) {
        setHighlightedContent(highlighted);
      }
    }
  }, [keywordData, blogPost?.content]);

  const highlightKeywords = (content: string, keywordData: KeywordData | null): string => {
    if (!content || !keywordData?.extracted_keywords) return content;

    // Make a copy of content to work with
    let highlightedContent = content;
    
    // Escape special characters in phrases for regex
    const escapeRegExp = (string: string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };
    
    // Add word boundary to avoid highlighting substrings
    const wrapWithWordBoundary = (word: string) => {
      // Only add word boundaries to whole words (not phrases)
      return word.includes(' ') ? word : `\\b${word}\\b`;
    };
    
    // Process custom keywords if available, otherwise use extracted keywords
    const phrasesToHighlight = keywordData.custom_keywords?.phrases || 
      keywordData.extracted_keywords.phrases.map(p => p.phrase);
    
    const wordsToHighlight = keywordData.custom_keywords?.single_words || 
      keywordData.extracted_keywords.single_words.map(([word]) => word);
    
    // Sort phrases by length (longest first) to avoid nested highlights
    const sortedPhrases = [...(phrasesToHighlight || [])]
      .sort((a, b) => b.length - a.length);

    // Highlight phrases with stronger background - using data attributes to make more compatible with editor
    sortedPhrases.forEach(phrase => {
      const escapedPhrase = escapeRegExp(phrase);
      // Better regex to avoid matching inside tags
      // This regex looks for the phrase, but not if it's inside an HTML tag or already inside a span
      const regex = new RegExp(`(${escapedPhrase})(?![^<>]*>|[^<>]*</span>)`, 'gi');
      highlightedContent = highlightedContent.replace(regex, 
        `<span class="keyword-highlight phrase-highlight no-text-select" style="background-color: rgba(34, 197, 94, 0.15); color: inherit; padding: 0 2px; border-radius: 2px; user-select: text;" data-keyword-type="phrase" data-keyword-text="$1">$1</span>`
      );
    });

    // Highlight single words with lighter background
    wordsToHighlight?.forEach(word => {
      const escapedWord = escapeRegExp(word);
      // Better regex to avoid matching inside tags or spans
      const regex = new RegExp(`(${wrapWithWordBoundary(escapedWord)})(?![^<>]*>|[^<>]*</span>)`, 'gi');
      highlightedContent = highlightedContent.replace(regex, 
        `<span class="keyword-highlight word-highlight no-text-select" style="background-color: rgba(34, 197, 94, 0.08); color: inherit; padding: 0 2px; border-radius: 2px; user-select: text;" data-keyword-type="word" data-keyword-text="$1">$1</span>`
      );
    });

    return highlightedContent;
  };

  // Function to get the most up-to-date content from the editor
  const getCurrentEditorContent = (): string => {
    // Try to get content directly from the editor DOM element
    const editorElement = document.querySelector('.blog-editor-container [contenteditable="true"]');
    if (editorElement && editorElement instanceof HTMLElement) {
      console.log('Found editor element, getting content');
      return editorElement.innerHTML;
    }
    
    // As a fallback, try to find the editor by its role
    const editorByRole = document.querySelector('[role="textbox"]');
    if (editorByRole && editorByRole instanceof HTMLElement) {
      console.log('Found editor by role, getting content');
      return editorByRole.innerHTML;
    }
    
    console.log('Using fallback content', currentBlogContent?.length);
    return currentBlogContent || (blogPost ? blogPost.content : '');
  };

  // Function to get the most up-to-date title from the editor
  const getCurrentEditorTitle = (): string => {
    // Try to get title directly from the editor DOM element
    const titleInput = document.querySelector('.blog-editor-container input[type="text"][placeholder="Enter title"]');
    if (titleInput && titleInput instanceof HTMLInputElement) {
      console.log('Found title input, getting value');
      return titleInput.value;
    }
    
    // Try alternative selectors for the title input
    const titleByClass = document.querySelector('.blog-title-input');
    if (titleByClass && titleByClass instanceof HTMLInputElement) {
      console.log('Found title by class, getting value');
      return titleByClass.value;
    }
    
    // Look for any input with placeholder containing "title"
    const titleByPlaceholder = document.querySelector('input[placeholder*="title" i]');
    if (titleByPlaceholder && titleByPlaceholder instanceof HTMLInputElement) {
      console.log('Found title by placeholder, getting value');
      return titleByPlaceholder.value;
    }
    
    console.log('Using fallback title', currentBlogTitle);
    return currentBlogTitle || (blogPost ? blogPost.title : '');
  };

  // Function to handle scheduling - updated to use admin API
  const handleSchedule = async () => {
    if (!blogPost?.id) {
      toast.error('No blog post available to schedule');
      return;
    }

    if (!scheduledDate) {
      toast.error('Please select a date for scheduling');
      return;
    }

    try {
      // Get the most current content directly from the editor
      const editorContent = getCurrentEditorContent();
      const cleanContent = removeHighlightSpans(editorContent);
      const title = getCurrentEditorTitle();
      
      console.log('Scheduling blog post:', {
        id: blogPost.id,
        title: title,
        scheduledDate: scheduledDate
      });

      const response = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.scheduleBlog),
        {
          method: 'POST',
          body: JSON.stringify({
            id: blogPost.id,
            title: title,
            content: cleanContent,
            featured_image: blogPost.featured_image,
            featured_image_alt: blogPost.featured_image_alt,
            scheduled_publish: scheduledDate,
            seo_title: blogPost.seo_title,
            seo_description: blogPost.seo_description,
            seo_keywords: blogPost.seo_keywords,
            rich_schema: blogPost.rich_schema, // Note: Scheduling uses current stored value
            og_image: blogPost.og_image,
            blog_group_id: selectedBlogGroupId // Use state variable here
          })
        }
      );

      // Log response for debugging
      console.log('Schedule response status:', response.status);

      // Safe JSON parsing
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        toast.error('Server error: Please check your connection');
        console.error('Non-JSON response:', text.slice(0, 200));
        return;
      }
      const result = await response.json();
      console.log('Schedule response:', result);

      if (result.success) {
        toast.success('Blog scheduled successfully');
        setBlogPost({
          ...blogPost,
          status: 'scheduled',
          scheduled_publish: scheduledDate,
          blog_group_id: selectedBlogGroupId // Update state with group ID from state variable
        });
        setShowScheduleModal(false);
      } else {
        toast.error(result.message || 'Failed to schedule blog');
      }
    } catch (error) {
      console.error('Error scheduling blog:', error);
      toast.error('Failed to schedule blog');
    }
  };

  // Get human-readable status
  const getStatusDisplay = (status: string | undefined) => {
    if (!status) return 'Unknown';
    
    return {
      'draft': 'Draft',
      'published': 'Published',
      'scheduled': 'Scheduled'
    }[status] || status.charAt(0).toUpperCase() + status.slice(1);
  };

  // Get status color
  const getStatusColor = (status: string | undefined) => {
    if (!status) return 'bg-gray-200 text-gray-800';
    
    return {
      'draft': 'bg-yellow-100 text-yellow-800',
      'published': 'bg-green-100 text-green-800',
      'scheduled': 'bg-blue-100 text-blue-800'
    }[status] || 'bg-gray-200 text-gray-800';
  };

  // Format date for display
  const formatScheduledDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Handler for image selection from the gallery
  const handleGalleryImageSelect = (imageUrl: string) => {
    if (blogEditorRef.current) {
      blogEditorRef.current.insertImage(imageUrl);
    }
  };

  // Handler to update selected blog group ID from BlogEditor
  const handleBlogGroupChange = (groupId: number | null) => {
    setSelectedBlogGroupId(groupId);
  };

  useEffect(() => {
    if (blogPost) {
      setCurrentBlogContent(blogPost.content);
      setCurrentBlogTitle(blogPost.title);
      setHighlightedContent(highlightKeywords(blogPost.content, keywordData));
      setSelectedBlogGroupId(blogPost.blog_group_id ?? null); // Initialize state from fetched blog post
    }
  }, [blogPost, keywordData]); // Add blogPost to dependencies

  // Add function to handle slug editing
  const handleSlugEdit = () => {
    setSlugValue(blogPost?.slug || '');
    setIsSlugEditing(true);
  };

  // Add function to cancel slug editing
  const handleSlugCancel = () => {
    setIsSlugEditing(false);
    setSlugValue(blogPost?.slug || '');
  };

  // Add function to save slug
  const handleSlugSave = async () => {
    if (!blogPost?.id) return;
    
    try {
      setIsSlugSaving(true);
      
      const response = await adminFetch(
        getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.posts.update),
        {
          method: 'POST',
          body: JSON.stringify({
            id: blogPost.id,
            slug: slugValue
          })
        }
      );
      
      // Safe JSON parsing
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        toast.error('Server error: Please check your connection');
        console.error('Non-JSON response:', text.slice(0, 200));
        return;
      }
      const result = await response.json();
      
      if (result.success) {
        // Update the blog post with the new slug
        setBlogPost(prev => {
          if (!prev) return null;
          return {
            ...prev,
            slug: slugValue // Use the value we just saved
          };
        });
        
        setIsSlugEditing(false);
        toast.success('URL slug updated successfully');
      } else {
        toast.error(result.message || 'Failed to update slug');
      }
    } catch (error) {
      console.error('Error updating slug:', error);
      toast.error('Failed to update URL slug');
    } finally {
      setIsSlugSaving(false);
    }
  };

  // Update useEffect to set initial slug value
  useEffect(() => {
    if (blogPost?.slug) {
      setSlugValue(blogPost.slug);
    }
  }, [blogPost?.slug]);

  // Handle block type drop on editor
  useEffect(() => {
    // The contenteditable element is inside the BlogEditor component.
    // We wait for highlightedContent to be ready before looking for it.
    const editor = document.querySelector<HTMLElement>('.blog-editor-container [contenteditable="true"]');
    if (!editor) {
      return;
    }

    const handleDrop = (e: DragEvent) => {
      // Check if a block type is being dropped
      const blockType = e.dataTransfer?.getData('blockType');
      if (blockType) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log(`Inserting block of type: ${blockType}`);
        
        // Get the BlogEditor ref instance
        if (blogEditorRef.current?.insertBlock) {
          blogEditorRef.current.insertBlock(blockType);
        } else {
          console.error('BlogEditor ref not available or insertBlock method is missing');
        }
      }
    };

    editor.addEventListener('drop', handleDrop as EventListener);
    
    return () => {
      editor.removeEventListener('drop', handleDrop as EventListener);
    };
  }, [highlightedContent]); // Depend on highlightedContent to ensure editor is ready

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
      </div>
    )
  }

  if (error || !keywordData) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <p className="text-gray-500">{error || 'Keyword not found'}</p>
          <Link href="/keyword-research" className="mt-4 inline-flex items-center text-blue-600 hover:text-blue-800">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Keyword Research
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>{keywordData.keyword} - Keyword Research - App Admin</title>
      </Head>

      {/* Regeneration Overlay */}
      {regenerationOverlay && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-white text-xl font-medium">Regenerating Blog Content...</p>
          <p className="text-white text-sm mt-2">This may take a minute or two. Please wait.</p>
        </div>
      )}
      
      {/* Main container */}
      <div className="flex h-screen overflow-hidden bg-gray-100">
        {/* Left Sidebar (SERP Results) */}
        {/* Always visible on lg+, conditionally visible below lg */}
        <div className={`fixed inset-y-0 left-0 transform ${isLeftSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:inset-auto z-30 w-64 sm:w-72 lg:w-80 bg-gradient-to-b from-gray-50 to-white flex flex-col border-r border-gray-200 shadow-sm transition-transform duration-300 ease-in-out`}>
          {/* Sidebar Header - Fixed at top */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-gray-900 mb-1">Research Data</h2>
                <div className="flex items-center">
                  <span className="text-xs font-medium text-gray-500 mr-1.5">Keyword:</span>
                  <p className="text-xs font-semibold text-blue-600 truncate">
                    {keywordData.keyword}
                  </p>
                </div>
              </div>
              {/* Close button for mobile/tablet */}
              <button 
                onClick={() => setIsLeftSidebarOpen(false)} 
                className="lg:hidden ml-3 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
                aria-label="Close sidebar"
              >
                <XCircleIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          
          {/* Left Sidebar Tabs - Fixed below header */}
          <div className="flex-shrink-0 border-b border-gray-200 bg-white shadow-sm sticky top-[68px] z-10">
            <nav className="flex" aria-label="Tabs">
              <button
                onClick={() => setLeftSidebarTab('serp')}
                className={`flex-1 py-2.5 px-3 text-center border-b-2 text-xs font-semibold transition-all duration-200 ${
                  leftSidebarTab === 'serp'
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                <span className="flex items-center justify-center">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  SERP Results
                </span>
              </button>
              <button
                onClick={() => setLeftSidebarTab('blocks')}
                className={`flex-1 py-2.5 px-3 text-center border-b-2 text-xs font-semibold transition-all duration-200 ${
                  leftSidebarTab === 'blocks'
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                <span className="flex items-center justify-center">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
                  </svg>
                  Blocks
                </span>
              </button>
            </nav>
          </div>
          
          {/* Sidebar Content - Scrollable with bottom padding for footer */}
          <div className="flex-1 overflow-y-auto pb-24 lg:pb-20">
            {leftSidebarTab === 'serp' && (
              <div className="bg-white">
                {keywordData.search_results?.map((result, index) => (
                  <ResultItem key={index} result={result} index={index} />
                ))}
              </div>
            )}
            {leftSidebarTab === 'blocks' && (
              <div className="p-3 bg-white">
                <div className="mb-3">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Content Blocks</h3>
                  <p className="text-xs text-gray-500">Drag and drop into editor</p>
                </div>
                <div className="space-y-2">
                  <BlockItem
                    title="Call to Action (CTA)"
                    icon={
                      <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-red-100 to-red-50 rounded-lg text-red-600 shadow-sm">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                    }
                    onDragStart={(e) => {
                      e.dataTransfer.setData('blockType', 'cta');
                    }}
                  />
                  <BlockItem
                    title="Quote"
                    icon={
                      <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-purple-100 to-purple-50 rounded-lg text-purple-600 shadow-sm">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                        </svg>
                      </div>
                    }
                    onDragStart={(e) => {
                      e.dataTransfer.setData('blockType', 'quote');
                    }}
                  />
                  <BlockItem
                    title="FAQ"
                    icon={
                      <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-yellow-100 to-yellow-50 rounded-lg text-yellow-600 shadow-sm">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                      </div>
                    }
                    onDragStart={(e) => {
                      e.dataTransfer.setData('blockType', 'faq');
                    }}
                  />
                  <BlockItem
                    title="Video"
                    icon={
                      <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-pink-100 to-pink-50 rounded-lg text-pink-600 shadow-sm">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                        </svg>
                      </div>
                    }
                    onDragStart={(e) => {
                      e.dataTransfer.setData('blockType', 'video');
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        {/* Remove relative z-10 to simplify stacking context */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Bar for Mobile/Tablet Toggles */}
          {/* Remove z-10, sticky positioning should handle layering relative to scrolling content */}
          <div className="lg:hidden bg-white shadow-sm p-2 flex justify-between items-center sticky top-0"> 
            <button 
              onClick={() => setIsLeftSidebarOpen(true)}
              className="text-gray-600 hover:text-gray-900"
            >
              <Bars3Icon className="h-6 w-6" />
              <span className="sr-only">Open SERP Results</span>
            </button>
            <h1 className="text-base font-medium text-gray-700 truncate px-2">
              {keywordData.keyword}
            </h1>
            <button 
              onClick={() => setIsRightSidebarOpen(true)}
              className="text-gray-600 hover:text-gray-900"
            >
              <Bars3Icon className="h-6 w-6" /> 
              <span className="sr-only">Open Analysis/Gallery</span>
            </button>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50/20 pb-24 lg:pb-16"> 
            <div className="max-w-6xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
              {/* Back Button & Preview Link - Modern Compact */}
              <div className="mb-3 flex items-center justify-between">
                <Link href="/keyword-research" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 hover:border-blue-300 transition-all shadow-sm">
                  <ArrowLeftIcon className="w-3.5 h-3.5" />
                  <span>Back</span>
                </Link>
                {keywordData.blog_generated === 1 && blogPost && blogPost.slug && (
                  <a 
                    href={`${publicBaseUrl}/blog/${blogPost.slug}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 hover:border-indigo-300 transition-all shadow-sm"
                  >
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </a>
                )}
              </div>

              {/* Keyword Header - Ultra Compact with Gradient */}
              <div className="mb-3 bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md rounded-lg px-4 py-2.5 border border-blue-700/20">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h1 className="text-base font-bold text-white truncate mb-0.5">{keywordData.keyword}</h1>
                    <div className="flex items-center gap-3 text-xs text-blue-100">
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        <span>{keywordData.location}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                        </svg>
                        <span>{new Date(keywordData.created_at).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Blog Generation / Prompt / Editor Sections */}
              {/* Blog Generation UI */}
              {keywordData.blog_generated === 0 && (
                <div className="bg-white shadow-sm rounded-xl mb-4 border border-gray-100 overflow-hidden">
                   <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <h3 className="text-base font-bold text-gray-900">Blog Generation Settings</h3>
                  </div>
                  <div className="p-4 sm:p-6">
                    {/* Make company info scrollable if needed */}
                    <div className="mb-4 overflow-x-auto">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Company Information</label>
                      <div className="bg-gray-50 rounded-md p-3 sm:p-4 text-xs sm:text-sm text-gray-700">
                        <div><strong>Company:</strong> {companyInfo.company_name}</div>
                        <div className="mt-1 sm:mt-2"><strong>About:</strong> {companyInfo.company_about}</div>
                        <div className="mt-1 sm:mt-2"><strong>Details:</strong> {companyInfo.company_details}</div>
                        <div className="mt-1 sm:mt-2"><strong>Location:</strong> {companyInfo.location || keywordData.location}</div>
                      </div>
                    </div>
                    
                    {/* Adjust button layout/size */}
                    <div className="flex flex-col space-y-3 sm:space-y-4">
                      <button
                        type="button"
                        onClick={handleBlogGeneration}
                        disabled={isBlogGenerating}
                        className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        {/* ... button content ... */}
                        {isBlogGenerating ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating Blog...
                          </>
                        ) : (
                          'Generate Blog'
                        )}
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => setShowPromptSection(!showPromptSection)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium inline-flex items-center self-start" // Align left
                      >
                        {/* ... button content ... */}
                        {showPromptSection ? (
                          <>
                            <ChevronDownIcon className="w-4 h-4 mr-1" />
                            Hide Custom Prompt
                          </>
                        ) : (
                          <>
                            <ChevronRightIcon className="w-4 h-4 mr-1" />
                            Use Custom Prompt
                          </>
                        )}
                      </button>
                    </div>
                    
                    {showPromptSection && (
                      <div className="mt-4 border-t border-gray-200 pt-4">
                        <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
                          Custom Prompt
                        </label>
                        <textarea
                          id="prompt"
                          rows={5}
                          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border border-gray-300 rounded-md"
                          placeholder="Enter a custom prompt for the AI to generate the blog post..."
                          value={promptText}
                          onChange={(e) => setPromptText(e.target.value)}
                        ></textarea>
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={handleGenerateFromPrompt}
                            disabled={isGenerating || !promptText.trim()}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                          >
                            {/* ... button content ... */}
                            {isGenerating ? (
                              <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Generating...
                              </>
                            ) : (
                              'Generate with Custom Prompt'
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Generation Progress */}
                    {generationProgress && (
                      <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-md">
                        <p className="text-sm text-blue-700">{generationProgress}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Blog Prompt Section - Modern Collapsible */}
               {keywordData.blog_generated === 1 && blogPost && (
                <div className="bg-white shadow-sm rounded-lg mb-3 border border-gray-200/60 overflow-hidden hover:shadow-md transition-shadow">
                  <div 
                    className="px-4 py-2.5 bg-gradient-to-r from-slate-50 to-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0 cursor-pointer border-b border-gray-200/60"
                    onClick={() => setIsBlogPromptExpanded(!isBlogPromptExpanded)}
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <h3 className="text-sm font-bold text-gray-800">Blog Prompt</h3>
                      {isBlogPromptExpanded ? (
                        <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                    {isBlogPromptExpanded && (
                      <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={handleSavePrompt}
                          disabled={savingPrompt}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm hover:shadow"
                        >
                          <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                          {savingPrompt ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleRegenerateContent}
                          disabled={isRegenerating}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-all shadow-sm hover:shadow"
                        >
                          {isRegenerating ? (
                            <>
                              <svg className="animate-spin w-3 h-3 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>Regenerating...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              <span>Regenerate</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  {isBlogPromptExpanded && (
                    <div className="p-6 pt-0">
                      <textarea
                        rows={5}
                        className="shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block w-full text-sm border-2 border-gray-200 rounded-xl p-4 transition-all hover:border-gray-300 font-normal"
                        value={promptText}
                        onChange={(e) => setPromptText(e.target.value)}
                        placeholder="Enter your blog generation prompt..."
                      ></textarea>
                    </div>
                  )}
                </div>
              )}
              {/* Editor Section - Modern Layout */}
               {keywordData.blog_generated === 1 && blogPost ? (
                <div className="bg-white shadow-sm rounded-lg border border-gray-200/60 overflow-hidden">
                  {/* Matching Score - Elegant Design */}
                  {blogMatchingScore !== null && (
                    <div className="bg-gradient-to-r from-blue-50/50 to-indigo-50/30 px-4 py-2.5 border-b border-gray-200/60">
                      <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsKeywordMatchExpanded(v => !v)}>
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                          </svg>
                          <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Keyword Match</span>
                          {isKeywordMatchExpanded ? (
                            <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                          ) : (
                            <ChevronRightIcon className="h-4 w-4 text-gray-500" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <svg className="w-8 h-8" viewBox="0 0 36 36">
                              <path
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="#E5E7EB"
                                strokeWidth="3"
                              />
                              <path
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke={blogMatchingScore >= 70 ? '#10B981' : blogMatchingScore >= 50 ? '#FBBF24' : '#EF4444'}
                                strokeWidth="3"
                                strokeDasharray={`${blogMatchingScore}, 100`}
                                strokeLinecap="round"
                              />
                              <text x="18" y="21" textAnchor="middle" fontSize="8" fill="#374151" fontWeight="700">
                                {blogMatchingScore}%
                              </text>
                            </svg>
                          </div>
                          <span className="text-base font-bold" style={{ color: blogMatchingScore >= 70 ? '#10B981' : blogMatchingScore >= 50 ? '#FBBF24' : '#EF4444' }}>
                            {blogMatchingScore}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* URL Slug Editor - Modern Compact Design */}
                  <div className="bg-gradient-to-r from-slate-50/50 to-gray-50/30 px-4 py-3 border-b border-gray-200/60">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">URL</label>
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-1 bg-white rounded-md px-3 py-1.5 border border-gray-200">
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_DOMAIN || '').replace(/^https?:\/\//, '') || 'www.example.com'}/blog/
                        </span>
                        {isSlugEditing ? (
                          <>
                            <input
                              type="text"
                              value={slugValue}
                              onChange={(e) => setSlugValue(e.target.value)}
                              className="flex-1 min-w-0 text-xs border-0 focus:ring-0 p-0 text-gray-900 bg-transparent"
                              placeholder="your-blog-slug"
                            />
                            <button
                              onClick={handleSlugSave}
                              disabled={isSlugSaving}
                              className="p-0.5 text-green-600 hover:bg-green-50 rounded flex-shrink-0"
                              title="Save"
                            >
                              {isSlugSaving ? (
                                <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              ) : (
                                <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
                              )}
                            </button>
                            <button
                              onClick={handleSlugCancel}
                              className="p-0.5 text-red-600 hover:bg-red-50 rounded flex-shrink-0"
                              title="Cancel"
                            >
                              <XMarkIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 min-w-0 text-xs text-gray-900 truncate font-medium">{blogPost.slug || 'no-slug'}</span>
                            <button
                              onClick={handleSlugEdit}
                              disabled={blogPost.status === 'published'}
                              className={`p-0.5 rounded flex-shrink-0 ${blogPost.status === 'published' ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                              title="Edit URL"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative blog-editor-container" data-blog-id={blogPost.id} style={{ zIndex: 1 }}>
                    <BlogEditor
                      ref={blogEditorRef}
                      initialContent={blogPost.content}
                      initialTitle={blogPost.title}
                      initialFeaturedImage={blogPost.featured_image || ''}
                      initialFeatureImageAlt={blogPost.featured_image_alt ?? ''}
                      initialStatus={blogPost.status as 'draft' | 'published'}
                      initialSeoTitle={blogPost.seo_title ?? null}
                      initialSeoDescription={blogPost.seo_description ?? null}
                      initialSeoKeywords={blogPost.seo_keywords ?? null}
                      initialRichSchema={blogPost.rich_schema ?? null}
                      initialOgImage={blogPost.og_image ?? null}
                      initialBlogGroupId={selectedBlogGroupId ?? null}
                      hideRichSchema={true}
                      blogId={blogPost.id}
                      onSave={handleSave}
                      hideBlocksSidebar={true}
                      onFeatureImageChange={handleFeatureImageUpdate} 
                      onBlogGroupChange={handleBlogGroupChange}
                    />
                  </div>
                </div>
              ) : (
                // ... No Content Message ...
                <div className="bg-white shadow rounded-lg p-6 text-center">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Blog Content Available</h3>
                  <p className="text-gray-500 mb-4 text-sm sm:text-base">
                    {keywordData?.blog_generated === 1 ? 
                      "The blog was generated but content couldn't be loaded. The blog ID may be invalid." : 
                      "Use the Blog Generation Settings above to generate content for this keyword."}
                  </p>
                  
                  {keywordData?.blog_generated !== 1 && (
                    <button
                      onClick={handleBlogGeneration}
                      disabled={isBlogGenerating}
                      className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                    >
                      {/* ... button content ... */}
                      {isBlogGenerating ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Generating...
                        </>
                      ) : (
                        'Generate Blog Now'
                      )}
                    </button>
                  )}
                  
                  {generationProgress && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-md">
                      <p className="text-sm text-blue-700">{generationProgress}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Modern Bottom Action Bar */}
          {blogPost && (
            <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-white via-slate-50 to-white border-t border-gray-200 shadow-lg px-4 sm:px-6 py-3 flex flex-col sm:flex-row justify-between items-center z-50 space-y-2 sm:space-y-0 backdrop-blur-md bg-white/95">
              {/* Status Section */}
              <div className="flex items-center justify-center sm:justify-start w-full sm:w-auto gap-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-semibold text-gray-600">Status:</span>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(blogPost.status)}`}>
                    {getStatusDisplay(blogPost.status)}
                  </span>
                </div>
                
                {blogPost.status === 'scheduled' && blogPost.scheduled_publish && (
                  <span className="text-xs text-gray-500 font-medium hidden lg:inline bg-gray-100 px-2 py-1 rounded-md">
                    {formatScheduledDate(blogPost.scheduled_publish)}
                  </span>
                )}
              </div>
              
              {/* Action Buttons */}
              <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-xs font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm hover:shadow"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  Save Draft
                </button>
                
                <button
                  type="button"
                  onClick={handlePublish}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg shadow-md text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Publish
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar (Analysis/Gallery) */}
        {/* Always visible on lg+, conditionally visible below lg */}
         <div className={`fixed inset-y-0 right-0 ${isRightSidebarOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0 lg:static lg:inset-auto z-30 w-72 sm:w-80 lg:w-[360px] bg-white shadow-lg overflow-hidden border-l border-gray-200 flex flex-col`}>
           {/* Close button for mobile/tablet */}
            <div className="lg:hidden px-4 py-3 text-right sticky top-0 bg-white z-10 border-b border-gray-200 shadow-sm">
                <button 
                onClick={() => setIsRightSidebarOpen(false)} 
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
                aria-label="Close sidebar"
                >
                <XCircleIcon className="h-5 w-5" />
                </button>
            </div>
           {/* Pass sidebar state to RightSideTabs if needed for internal adjustments */}
           <RightSideTabs 
             imageGalleryContent={
               blogPost ? (
                 <ImageGallery
                   onImageInsert={(imageUrl) => {
                     // Insert image at cursor position using BlogEditor ref
                     if (blogEditorRef.current) {
                       blogEditorRef.current.insertImage(imageUrl)
                     }
                   }}
                   onSetFeaturedImage={(imageUrl, altText) => {
                     // Update featured image
                     if (blogPost) {
                       handleFeatureImageUpdate(imageUrl, altText)
                     }
                   }}
                   currentFeaturedImage={blogPost.featured_image}
                 />
               ) : (
                 <div className="flex items-center justify-center h-full p-6">
                   <p className="text-sm text-gray-500">Generate a blog post to access image gallery</p>
                 </div>
               )
             }
             keywordAnalysisContent={
               <div className="flex flex-col h-full">
                 {/* Compact Tabs Header - Fixed */}
                 <div className="flex-shrink-0 border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
                   <nav className="flex" aria-label="Tabs">
                     <button
                       onClick={() => setActiveTab('phrases')}
                       className={`flex-1 py-3 px-3 text-center border-b-2 text-xs font-bold transition-all duration-200 ${
                         activeTab === 'phrases'
                           ? 'border-blue-600 text-blue-600 bg-blue-50'
                           : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:border-gray-300'
                       }`}
                     >
                       <span className="flex items-center justify-center">
                         <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                         </svg>
                         Phrases
                       </span>
                     </button>
                     <button
                       onClick={() => setActiveTab('single_words')}
                       className={`flex-1 py-3 px-3 text-center border-b-2 text-xs font-bold transition-all duration-200 ${
                         activeTab === 'single_words'
                           ? 'border-blue-600 text-blue-600 bg-blue-50'
                           : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:border-gray-300'
                       }`}
                     >
                       <span className="flex items-center justify-center">
                         <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                         </svg>
                         Single Words
                       </span>
                     </button>
                   </nav>
                 </div>

                 {/* Tab content - Scrollable */}
                 <div className="flex-1 overflow-y-auto overflow-x-hidden pb-20 lg:pb-16">
                   {activeTab === 'phrases' && (
                     <div className="p-3">
                       <div className="flex justify-between items-center mb-3">
                         <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Top Phrases</h3>
                         <button
                           onClick={handleCopyPhrases}
                           className="inline-flex items-center px-3 py-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold transition-all bg-blue-50 hover:bg-blue-100 rounded-md"
                           title="Copy all phrases"
                         >
                            {copiedPhrasesState ? (
                             <>
                               <ClipboardDocumentCheckIcon className="h-4 w-4 mr-1.5" />
                               <span>Copied!</span>
                             </>
                           ) : (
                             <>
                               <ClipboardDocumentIcon className="h-4 w-4 mr-1.5" />
                               <span>Copy All</span>
                             </>
                           )}
                         </button>
                       </div>
                       <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
                         <table className="w-full min-w-full">
                           <thead className="bg-gray-50 border-b border-gray-200">
                             <tr>
                               <th className="px-2 py-2 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Phrase</th>
                               <th className="px-1 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-12">Freq</th>
                               <th className="px-1 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-10">H1</th>
                               <th className="px-1 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-10">H2</th>
                               <th className="px-1 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-10">H3</th>
                               <th className="px-2 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-16">Score</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-100" suppressHydrationWarning>
                             {keywordData.extracted_keywords?.phrases?.map((phraseData, index) => (
                               <tr key={index} className="hover:bg-blue-50 transition-colors group">
                                 <td className="px-2 py-2 text-xs text-gray-900">
                                   <div className="font-medium truncate group-hover:text-blue-700 transition-colors max-w-[140px]" title={phraseData.phrase}>
                                     {phraseData.phrase}
                                   </div>
                                 </td>
                                 <td className="px-1 py-2 whitespace-nowrap text-xs text-gray-700 text-center font-bold">
                                   {phraseData.frequency}
                                 </td>
                                 <td className="text-center px-1 py-2">
                                   <PresenceIndicator value={phraseData.in_h1} />
                                 </td>
                                 <td className="text-center px-1 py-2">
                                   <PresenceIndicator value={phraseData.in_h2} />
                                 </td>
                                 <td className="text-center px-1 py-2">
                                   <PresenceIndicator value={phraseData.in_h3} />
                                 </td>
                                 <td className="px-2 py-2 text-center">
                                   {phraseData.quality_score ? (
                                     <CircularProgress score={phraseData.quality_score} />
                                   ) : (
                                     <span className="text-gray-400 text-xs font-medium">N/A</span>
                                   )}
                                 </td>
                               </tr>
                             ))}
                           </tbody>
                         </table>
                       </div>
                     </div>
                   )}

                   {activeTab === 'single_words' && (
                      <div className="p-3">
                       <div className="flex justify-between items-center mb-3">
                         <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Top Keywords</h3>
                         <button
                           onClick={handleCopyWords}
                           className="inline-flex items-center px-3 py-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold transition-all bg-blue-50 hover:bg-blue-100 rounded-md"
                           title="Copy all words"
                         >
                           {copiedWordsState ? (
                             <>
                               <ClipboardDocumentCheckIcon className="h-4 w-4 mr-1.5" />
                               <span>Copied!</span>
                             </>
                           ) : (
                             <>
                               <ClipboardDocumentIcon className="h-4 w-4 mr-1.5" />
                               <span>Copy All</span>
                             </>
                           )}
                         </button>
                       </div>
                       <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
                         <table className="w-full min-w-full">
                           <thead className="bg-gray-50 border-b border-gray-200">
                             <tr>
                               <th scope="col" className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Keyword</th>
                               <th scope="col" className="px-3 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-20">Frequency</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-100" suppressHydrationWarning>
                             {keywordData.extracted_keywords?.single_words?.map(([word, frequency], index) => (
                               <tr key={index} className="hover:bg-blue-50 transition-colors group">
                                 <td className="px-3 py-2 text-xs text-gray-900">
                                   <div className="font-medium truncate group-hover:text-blue-700 transition-colors" title={word}>
                                     {word}
                                   </div>
                                 </td>
                                 <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 text-center font-bold">{frequency}</td>
                               </tr>
                             ))}
                           </tbody>
                         </table>
                       </div>
                     </div>
                   )}
                 </div>
               </div>
             }
           />
         </div>
      </div>
      <Toaster position="top-right" />
    </>
  )
}

export default KeywordDetail