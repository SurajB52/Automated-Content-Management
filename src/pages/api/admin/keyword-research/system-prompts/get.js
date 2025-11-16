import { executeBusinessQuery } from '@/lib/database.js'
import { ApiResponse } from '@/lib/session.js'
import logger from '@/lib/logger.js'
import { requireAdminAuth } from '@/lib/adminAuth.js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json(ApiResponse.error('Method not allowed', 405))
    }

    const admin = await requireAdminAuth(req, res)
    if (!admin) return

    // Support both GET (query params) and POST (body params)
    const params = req.method === 'POST' ? req.body : req.query
    const { type, prompt_for } = params || {}
    
    if (!type || !prompt_for) {
      return res.status(422).json(ApiResponse.validation({ type: 'required', prompt_for: 'required' }))
    }

    // Normalize type to match seeded records
    const rawType = String(type)
    const normalizedType = rawType === 'blog' ? 'blog_content_keyword_research' : rawType

    const rows = await executeBusinessQuery(
      'SELECT * FROM system_prompts WHERE type = ? AND prompt_for = ? LIMIT 1',
      [normalizedType, String(prompt_for)]
    )
    const data = rows?.[0] || null

    // If not found, return defaults matching legacy PHP behavior
    if (!data) {
      const pf = String(prompt_for)
      let defaultPrompt = ''
      if (pf === 'customer' || pf === 'customer_kr') {
        defaultPrompt = `1. Target the keyword: Ensure that the keyword appears naturally at an optimal density (1-1.5%) throughout the content, including the title, meta description, headings, body, and image alt text. Also, use LSI (Latent Semantic Indexing) keywords and related phrases.
2. Title: Craft a catchy and SEO-optimized title containing the target keyword at the beginning. Ensure the title is compelling, clear, and likely to increase click-through rate (CTR). Aim to keep it under 60 characters.
3. Meta Description: Write a compelling meta description under 160 characters that includes the target keyword and entices users to click. Make sure it clearly articulates the value the reader will get from the content.
4. Headings: Use properly structured headings (H1, H2, H3) to break the content into digestible sections. The H1 must include the target keyword and should be concise. Each H2 should cover a specific subtopic and provide additional value compared to the existing content.
5. Internal Links: Include internal links to other relevant articles or pages on your website, ensuring a logical structure. Use anchor text relevant to the target keyword. Add at least 2-3 internal links.
6. External Links: Link to high-authority external websites that support the information in your article. Make sure they are reputable, and that at least 2-3 external links add value and support your claims.
7. Alt Text: Include descriptive alt text for every image in the post, making sure it reflects the content and includes the target keyword if possible.
8. Schema Markup: Implement the appropriate schema markup for this content (e.g., Article, FAQ, or How-To schema depending on the content). Ensure that the schema is properly structured for rich snippets.
9. Content Length: The content should be at least 1,500 words or longer if required to provide a more in-depth resource than the existing ranking content.
10. Backlinks: Suggest high-quality, relevant backlinks to authoritative sites that will improve the credibility and SEO of your blog post.
11. Content Optimization: Use engaging multimedia (videos, images, infographics) to break up text and make the content visually appealing. Ensure images are compressed and optimized for SEO.
12. User Experience: Make sure the content is easy to read, well-structured, and visually appealing. Use bullet points, numbered lists, and relevant examples to improve readability.
13. Call to Action (CTA): End the article with a strong call to action (e.g., ask readers to download a free guide, subscribe to a newsletter, or explore related resources). Ensure the CTA aligns with the intent of the keyword.
14. Humanized Tone: The content should feel genuine, approachable, and engaging while maintaining professionalism. Avoid robotic or overly technical language.
15. Differentiation: After analyzing the existing top-ranking content, ensure that your content covers any missing information, new perspectives, or extra value that will make your article the most comprehensive, well-rounded resource on this topic.`
      } else if (pf === 'service_provider' || pf === 'service_provider_kr') {
        defaultPrompt = `1. Professional Expertise: Demonstrate deep industry knowledge and expertise while maintaining a professional yet approachable tone. Focus on establishing authority in your field.
2. Technical Accuracy: Ensure all technical information, methodologies, and industry-specific terminology are accurate and up-to-date. Include relevant citations and references where appropriate.
3. Problem-Solution Framework: Structure content around common industry challenges and provide detailed, actionable solutions that showcase your expertise and services.
4. Industry Best Practices: Incorporate current industry standards, regulations, and best practices. Explain how your services align with or exceed these standards.
5. Case Studies: Include relevant case studies or real-world examples that demonstrate successful implementation of your services or solutions.
6. ROI Focus: Emphasize the business value and return on investment of your services. Use data and metrics to support your claims.
7. Competitive Differentiation: Highlight your unique value proposition and what sets your services apart from competitors in the market.
8. Client Education: Provide educational content that helps potential clients better understand your services and make informed decisions.
9. Industry Trends: Analyze and discuss current trends, challenges, and opportunities in your industry sector.
10. Compliance and Regulations: Address relevant compliance requirements and regulatory considerations in your industry.
11. Service Integration: Explain how your services integrate with existing business processes and systems.
12. Professional Network: Reference professional associations, certifications, and partnerships that validate your expertise.
13. Client Collaboration: Describe your approach to client collaboration and communication throughout the service delivery process.
14. Quality Assurance: Detail your quality control processes and commitment to delivering excellence in your services.
15. Future Outlook: Provide insights into future industry developments and how your services prepare clients for upcoming challenges.`
      }

      return res.status(200).json(
        ApiResponse.success(
          {
            prompt: defaultPrompt,
            company_name: '',
            company_details: '',
            company_about: '',
            keyword_guideline: '',
            location: '',
            is_default: true,
          },
          'OK'
        )
      )
    }

    // When found, return row as-is; callers can read fields directly
    return res.status(200).json(ApiResponse.success(data, 'OK'))
  } catch (error) {
    logger.error('system-prompts/get error', { error: error.message, stack: error.stack })
    return res.status(500).json(ApiResponse.error('Failed to load system prompt'))
  }
}

