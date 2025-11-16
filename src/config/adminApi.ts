/**
 * Admin API Configuration
 * Centralized configuration for admin panel API endpoints
 */

// Note: admin token helper removed as unused to satisfy linting

/**
 * Build admin URL with token and optional query parameters
 */
export function getAdminUrl(endpoint: string, params?: Record<string, string>): string {
  const baseUrl = `/api`
  
  // Remove leading slash if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  
  let url = `${baseUrl}${cleanEndpoint}`
  
  // Add query parameters if provided
  if (params && Object.keys(params).length > 0) {
    const queryString = new URLSearchParams(params).toString()
    url += `?${queryString}`
  }
  
  return url
}

/**
 * Admin fetch wrapper with credentials
 */
export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const isFormData = typeof window !== 'undefined' && options.body instanceof FormData

  // Start with caller-provided headers
  const headersInit: HeadersInit | undefined = options.headers as HeadersInit | undefined
  const headers: Record<string, string> = {}
  if (headersInit instanceof Headers) {
    headersInit.forEach((value, key) => {
      headers[key] = String(value)
    })
  } else if (Array.isArray(headersInit)) {
    for (const [key, value] of headersInit) {
      headers[key] = String(value)
    }
  } else if (headersInit && typeof headersInit === 'object') {
    for (const [key, value] of Object.entries(headersInit)) {
      if (value !== undefined) headers[key] = String(value as string)
    }
  }

  // Only set JSON content-type when NOT sending FormData. For FormData, the browser must set the boundary.
  if (!isFormData) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
  }

  const fetchOptions: RequestInit = {
    credentials: 'include',
    ...options,
    headers,
  }

  return fetch(url, fetchOptions)
}

/**
 * Admin API endpoints configuration
 */
const ADMIN_API_CONFIG = {
  endpoints: {
    // Keyword Research endpoints
    keywordResearch: {
      search: '/admin/keyword-research/python_search',
      list: '/admin/keyword-research/list',
      get: '/admin/keyword-research/get',
      delete: '/admin/keyword-research/delete',
      quotaCheck: '/admin/keyword-research/quota_check',
      generateBlog: '/admin/keyword-research/new_rewrite_kr',
      fetchTags: '/admin/keyword-research/new_rewrite_kr',
      enhance: '/admin/keyword-research/enhance',
      // Note: API route file is save_custom_keywords.js (underscore), align endpoint accordingly
      saveCustomKeywords: '/admin/keyword-research/save_custom_keywords',
      updateBlogStatus: '/admin/keyword-research/update-blog-status',
    },
    
    // Blog Content Manager endpoints
    blogContentManager: {
      getSystemPrompt: '/admin/keyword-research/system-prompts/get',
      saveSystemPrompt: '/admin/keyword-research/system-prompts/save',
    },
    
    // Blog Management endpoints
    blogManagement: {
      getBlogPost: '/admin/blog/posts/get',
      groups: '/admin/blog/groups',
      addGroup: '/admin/blog/groups/add',
      posts: {
        update: '/admin/blog/posts/update',
      },
      images: {
        upload: '/admin/blog/content-images/upload',
      },
      gallery: {
        list: '/admin/blog/gallery/list',
        upload: '/admin/blog/gallery/upload',
      },
    },
  },
}

// Named export for the config
export default ADMIN_API_CONFIG

// Also export the individual utilities
export { ADMIN_API_CONFIG }

// Legacy compatibility - export as adminApi with utility methods
export const adminApi = {
  getAdminUrl,
  adminFetch,
  endpoints: ADMIN_API_CONFIG.endpoints,
  
  // Blog group management
  async addBlogGroup(name: string) {
    const url = getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.addGroup)
    const response = await adminFetch(url, {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    
    // Safe JSON parsing
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      const text = await response.text()
      throw new Error(`API returned non-JSON response: ${text.slice(0, 100)}`)
    }
    
    return response.json()
  },
}
