const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Google Gemini client
let genAI;
let geminiModel;
try {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
  // Use the standard Gemini Pro model which has higher quotas
  geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-pro-preview-03-25' });
} catch (error) {
  console.warn(`Google Gemini client initialization failed: ${error.message}`);
  // We'll handle this in the getLlmGuidance function
}

/**
 * Extract key information from HTML to reduce token count
 * @param {string} html - Raw HTML content
 * @returns {string} - Simplified HTML with just key elements
 */
function extractKeyInfoFromHtml(html) {
  // Very simplified extraction - in a real implementation, you'd use a proper HTML parser
  let simplified = '';
  
  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    simplified += `Title: ${titleMatch[1]}\n`;
  }
  
  // Extract meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/);
  if (descMatch) {
    simplified += `Description: ${descMatch[1]}\n`;
  }
  
  // Extract headings
  const h1Matches = html.match(/<h1[^>]*>([^<]+)<\/h1>/g) || [];
  const h2Matches = html.match(/<h2[^>]*>([^<]+)<\/h2>/g) || [];
  
  if (h1Matches.length > 0) {
    simplified += "\nMain Headings:\n";
    h1Matches.slice(0, 3).forEach(match => {
      const content = match.replace(/<[^>]+>/g, '').trim();
      simplified += `- ${content}\n`;
    });
  }
  
  if (h2Matches.length > 0) {
    simplified += "\nSubheadings:\n";
    h2Matches.slice(0, 5).forEach(match => {
      const content = match.replace(/<[^>]+>/g, '').trim();
      simplified += `- ${content}\n`;
    });
  }
  
  // Extract navigation links (simplified approach)
  const navMatches = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/g) || [];
  if (navMatches.length > 0) {
    simplified += "\nNavigation Links:\n";
    const navLinks = navMatches[0].match(/<a[^>]*>([^<]+)<\/a>/g) || [];
    navLinks.slice(0, 10).forEach(link => {
      const content = link.replace(/<[^>]+>/g, '').trim();
      if (content) {
        simplified += `- ${content}\n`;
      }
    });
  }
  
  return simplified;
}

/**
 * Get guidance from the LLM for different crawler tasks
 * @param {string} pageContent - HTML content of the page
 * @param {string} url - URL of the page
 * @param {string} task - Type of guidance needed (analyze_page, suggest_interactions)
 * @param {Array} additionalContext - Additional context for the LLM
 * @returns {Object} LLM guidance response
 */
async function getLlmGuidance(pageContent, url, task, additionalContext = null) {
  // Check if Gemini client is available
  if (!geminiModel) {
    console.warn('Google Gemini client not available, using fallback logic');
    if (task === 'analyze_page') {
      return generateFallbackAnalysis(url);
    } else if (task === 'suggest_interactions') {
      return generateFallbackInteractions(additionalContext);
    }
  }
  
  // Extract key information instead of using the full HTML
  const simplifiedContent = extractKeyInfoFromHtml(pageContent);
  
  // Limit the number of interactive elements to reduce token count
  let contextElements = additionalContext;
  if (additionalContext && Array.isArray(additionalContext) && additionalContext.length > 10) {
    // Just take the first 10 elements
    contextElements = additionalContext
      .filter(el => {
        // Filter out login/payment related elements
        const text = (el.text || '').toLowerCase();
        const selector = (el.selector || '').toLowerCase();
        const avoidTerms = (process.env.AVOID_TERMS || 'login,signin,register,checkout,payment,cart').split(',');
        return !avoidTerms.some(term => text.includes(term) || selector.includes(term));
      })
      .slice(0, 10);
  }
  
  let systemPrompt = '';
  let userPrompt = '';
  
  switch (task) {
    case 'analyze_page':
      systemPrompt = `You are a UX expert analyzing a webpage. Provide insights about the page's purpose, 
      structure, and potential UX issues. Focus on identifying the page type, main functionality, 
      and any obvious usability concerns.`;
      
      userPrompt = `Analyze this webpage at URL: ${url}
      
      Key page information:
      ${simplifiedContent}
      
      Provide a JSON response with the following structure:
      {
        "page_type": "home_page|product_page|checkout|login|etc",
        "primary_purpose": "brief description of what this page is for",
        "key_components": ["list", "of", "main", "UI", "components"],
        "ux_observations": ["list", "of", "potential", "UX", "issues", "or", "observations"],
        "suggested_improvements": ["list", "of", "potential", "improvements"]
      }`;
      break;
    
    case 'suggest_interactions':
      systemPrompt = `You are a UX testing expert guiding an automated crawler. 
      Your job is to identify the most meaningful interactions a user might perform on this page.
      
      PRIORITIZE product detail links that lead to individual product pages. When on a product listing or category page,
      focus on clicking the first/top product item rather than pagination or filtering controls.
      
      For example, on pages with URLs containing terms like 'jewellery', 'pendants', 'products', 'category', etc.,
      prioritize links that appear to lead to individual product detail pages.
      
      Focus on canonical paths rather than exhaustive testing of similar elements.
      
      AVOID interactions with navigation menus, headers, common site-wide elements that appear on every page, and banners.
      Focus on page-specific content and interactions that are unique to the current view, particularly elements 
      that appear below the page title.
      
      IMPORTANT: AVOID suggesting interactions with login forms, payment flows, checkout processes, banners, or any 
      sensitive user data entry. These should be excluded from automated testing.`;
      
      userPrompt = `Suggest the most important user interactions for this webpage at URL: ${url}
      
      Key page information:
      ${simplifiedContent}
      
      Available interactive elements (limited to 10 most important):
      ${JSON.stringify(contextElements, null, 2)}
      
      Provide a JSON response with the following structure:
      {
        "suggestions": [
          {
            "selector": "CSS selector of the element",
            "action": "click|fill|select",
            "value": "value to enter if action is fill or select",
            "text": "visible text of the element",
            "type": "element type",
            "reasoning": "why this interaction is important"
          }
        ],
        "ignored_elements": []
      }
      
      IMPORTANT GUIDELINES:
      1. If this is a product listing or category page, PRIORITIZE clicking on the FIRST product item
      2. Look for links with URLs containing patterns like '/product/', '/pendants/', '/item/', '~12345.html', etc.
      3. Prioritize product detail links over pagination, filtering, or sorting controls
      4. Suggest no more than 3-5 of the most important interactions
      5. AVOID login forms, signup buttons, payment flows, checkout buttons, or any sensitive data entry
      6. Provide clear reasoning for each suggested interaction`;
      break;
    
    default:
      throw new Error(`Unknown LLM task: ${task}`);
  }
  
  try {
    // Add retry logic with exponential backoff
    const maxRetries = 3;
    let retryCount = 0;
    let content = '';
    
    while (retryCount < maxRetries) {
      try {
        // Create a chat session with Google Gemini
        const chat = geminiModel.startChat({
          generationConfig: {
            temperature: 0.3,
          },
        });
        
        // Send the system prompt first to set context
        await chat.sendMessage(systemPrompt);
        
        // Then send the user prompt and get the response
        const result = await chat.sendMessage(userPrompt);
        content = result.response.text();
        
        // If we get here, the request succeeded, so break out of the retry loop
        break;
      } catch (retryError) {
        retryCount++;
        
        // Check if this is a rate limit error
        if (retryError.message.includes('429') && retryCount < maxRetries) {
          // Extract retry delay if available, or use exponential backoff
          let retryDelay = 1000 * Math.pow(2, retryCount); // Default exponential backoff
          
          const retryInfoMatch = retryError.message.match(/retryDelay":"(\d+)s"/i);
          if (retryInfoMatch && retryInfoMatch[1]) {
            retryDelay = parseInt(retryInfoMatch[1], 10) * 1000;
          }
          
          console.log(`Rate limit hit. Retrying in ${retryDelay/1000} seconds... (Attempt ${retryCount} of ${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else if (retryCount >= maxRetries) {
          console.error(`Maximum retries (${maxRetries}) reached. Falling back to rule-based guidance.`);
          throw retryError; // Re-throw to trigger fallback
        } else {
          // Not a rate limit error or we've exceeded max retries
          throw retryError;
        }
      }
    }
    
    // Extract JSON from the response
    // Gemini often wraps JSON in markdown code blocks, so we need to handle that
    let jsonContent = content;
    
    // Check if the content is wrapped in a code block
    const jsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const match = content.match(jsonRegex);
    if (match && match[1]) {
      jsonContent = match[1].trim();
    }
    
    try {
      return JSON.parse(jsonContent);
    } catch (parseError) {
      console.warn(`Error parsing Gemini response as JSON: ${parseError.message}`);
      console.warn(`Raw response: ${content.substring(0, 100)}...`);
      
      // Try one more approach - look for any JSON-like structure
      const jsonObjectRegex = /\{[\s\S]*\}/;
      const objectMatch = content.match(jsonObjectRegex);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch (secondError) {
          console.warn('Second attempt to parse JSON failed');
        }
      }
      
      // Fall back to generated response
      if (task === 'analyze_page') {
        return generateFallbackAnalysis(url);
      } else {
        return generateFallbackInteractions(contextElements);
      }
    }
  } catch (error) {
    console.error(`Error getting LLM guidance: ${error.message}`);
    
    // Return a fallback response
    if (task === 'analyze_page') {
      return generateFallbackAnalysis(url);
    } else {
      return generateFallbackInteractions(contextElements);
    }
  }
}

/**
 * Generate a fallback page analysis when LLM is unavailable
 * @param {string} url - URL of the page
 * @returns {Object} - Basic page analysis
 */
function generateFallbackAnalysis(url) {
  const urlObj = new URL(url);
  const hostname = urlObj.hostname;
  const pathname = urlObj.pathname;
  
  // Make a basic guess at page type based on URL
  let pageType = "unknown";
  let purpose = "Information display";
  
  if (pathname === '/' || pathname === '') {
    pageType = "home_page";
    purpose = "Main entry point to the website";
  } else if (pathname.includes('product') || pathname.includes('item')) {
    pageType = "product_page";
    purpose = "Display product information";
  } else if (pathname.includes('category') || pathname.includes('collection')) {
    pageType = "category_page";
    purpose = "Display a collection of items";
  } else if (pathname.includes('search')) {
    pageType = "search_results";
    purpose = "Display search results";
  } else if (pathname.includes('about')) {
    pageType = "about_page";
    purpose = "Provide information about the organization";
  }
  
  return {
    page_type: pageType,
    primary_purpose: purpose,
    key_components: ["header", "main content", "navigation"],
    ux_observations: ["Automated analysis - no specific observations"],
    suggested_improvements: ["Consider manual UX review for detailed insights"]
  };
}

/**
 * Generate fallback interactions if LLM guidance fails
 * @param {Array} elements - Interactive elements on the page
 * @returns {Object} Fallback interaction suggestions
 */
function generateFallbackInteractions(elements) {
  if (!elements || !Array.isArray(elements)) {
    return { suggestions: [], ignored_elements: [] };
  }
  
  // Filter out login/payment related elements
  const filteredElements = elements.filter(el => {
    if (!el) return false;
    
    const text = (el.text || '').toLowerCase();
    const selector = (el.selector || '').toLowerCase();
    const avoidTerms = (process.env.AVOID_TERMS || 'login,signin,register,checkout,payment,cart').split(',');
    return !avoidTerms.some(term => text.includes(term) || selector.includes(term));
  });
  
  // Sort elements by importance with product detail links prioritized
  const sortedElements = [...filteredElements].sort((a, b) => {
    // Check for product detail links
    const aHref = a.href || '';
    const bHref = b.href || '';
    const aText = (a.text || '').toLowerCase();
    const bText = (b.text || '').toLowerCase();
    
    // Prioritize product detail links
    const aIsProductLink = isLikelyProductDetailLink(aHref, aText);
    const bIsProductLink = isLikelyProductDetailLink(bHref, bText);
    
    if (aIsProductLink && !bIsProductLink) return -1;
    if (bIsProductLink && !aIsProductLink) return 1;
    
    // Prioritize buttons and links
    if ((a.tagName === 'button' || a.role === 'button') && 
        (b.tagName !== 'button' && b.role !== 'button')) {
      return -1;
    }
    if ((b.tagName === 'button' || b.role === 'button') && 
        (a.tagName !== 'button' && a.role !== 'button')) {
      return 1;
    }
    
    // Prioritize navigation elements
    if (a.tagName === 'a' && b.tagName !== 'a') {
      return -1;
    }
    if (b.tagName === 'a' && a.tagName !== 'a') {
      return 1;
    }
    
    // Then prioritize by position (top to bottom)
    return a.position.y - b.position.y;
  });
  
  // Helper function to identify product detail links
  function isLikelyProductDetailLink(href, text) {
    if (!href) return false;
    
    // Check for common product detail URL patterns
    const productUrlPatterns = [
      /\/product\//i,
      /\/products\//i,
      /\/item\//i,
      /\/detail\//i,
      /\/pendants\//i,  // Specific to jewelry sites
      /\~\d+\.html/i,  // Common product ID pattern
      /\/p\//i,        // Common product path
      /\?productId=/i  // Query parameter for product
    ];
    
    return productUrlPatterns.some(pattern => pattern.test(href));
  }
  
  // Take the top 5 elements
  const suggestions = sortedElements.slice(0, 5).map(element => ({
    selector: element.selector,
    action: element.action || 'click',
    value: element.action === 'fill' ? 'test input' : '',
    text: element.text || '',
    type: element.tagName || 'unknown',
    reasoning: "Automatically selected as a potentially important interaction"
  }));
  
  return {
    suggestions,
    ignored_elements: []
  };
}

module.exports = {
  getLlmGuidance
};
