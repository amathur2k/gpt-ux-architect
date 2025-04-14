const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { generatePageFingerprint } = require('./utils/fingerprint');
const { getLlmGuidance } = require('./llm/guidance');
const { ensureDirectoryExists } = require('./utils/fileSystem');

// Store visited states to avoid loops
const visitedStates = new Map();
// Store canonical paths
const canonicalPaths = new Map();
// Store the complete crawl results
let crawlResults = {
  site_info: {},
  pages: [],
  canonical_paths: []
};

/**
 * Start the crawler with the configured settings
 */
async function startCrawler() {
  const targetUrl = process.env.TARGET_URL;
  const maxDepth = parseInt(process.env.MAX_DEPTH, 10);
  const screenshotDir = process.env.SCREENSHOT_DIR;
  const outputFile = process.env.OUTPUT_FILE;
  
  // Ensure screenshot directory exists
  await ensureDirectoryExists(screenshotDir);
  
  // Initialize site info
  crawlResults.site_info = {
    base_url: targetUrl,
    crawl_date: new Date().toISOString(),
    crawl_depth: maxDepth
  };
  
  // Launch browser with optimized settings for speed
  const browser = await chromium.launch({
    headless: false,
    timeout: 30000, // Reduced timeout for faster operation
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-notifications', '--disable-extensions'] // Optimized for speed
  });
  
  try {
    // Create a context with viewport size
    const context = await browser.newContext({
      viewport: {
        width: parseInt(process.env.VIEWPORT_WIDTH, 10),
        height: parseInt(process.env.VIEWPORT_HEIGHT, 10)
      },
      // Add any additional browser context settings here
      recordVideo: {
        dir: path.join(screenshotDir, 'videos'),
        size: { width: 1280, height: 720 }
      }
    });
    
    // Create a new page
    const page = await context.newPage();
    
    // Start crawling from the target URL
    await crawlPage(page, targetUrl, 0, maxDepth, null);
    
    // Process canonical paths
    processCanonicalPaths();
    
    // Save the results to JSON file
    await fs.writeFile(outputFile, JSON.stringify(crawlResults, null, 2));
    
    // Close the browser
    await browser.close();
    
    return crawlResults;
  } catch (error) {
    console.error('Critical error during crawl:', error);
    try {
      await browser.close();
    } catch (closeError) {
      console.error('Error while closing browser:', closeError.message);
    }
    throw error;
  }
}

/**
 * Crawl a specific page and its interactions
 */
async function crawlPage(page, url, currentDepth, maxDepth, parentAction) {
  if (currentDepth > maxDepth) {
    return;
  }
  
  console.log(`Crawling: ${url} (Depth: ${currentDepth}/${maxDepth})`);
  
  try {
    // Navigate to the URL
    await page.goto(url, { waitUntil: 'networkidle' });
  
  // Generate a unique ID for this page
  const pageId = `page_${uuidv4()}`;
  
  // Take a full page screenshot
  const screenshotPath = path.join(process.env.SCREENSHOT_DIR, `${pageId}_initial.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  
  // Get page title
  const title = await page.title();
  
  // Generate a fingerprint for this page
  const fingerprint = await generatePageFingerprint(page);
  
  // Check if we've seen a similar page before
  if (visitedStates.has(fingerprint)) {
    console.log(`Skipping already visited state: ${url}`);
    
    // Record this as a variation of a canonical path
    const canonicalPageId = visitedStates.get(fingerprint);
    if (!canonicalPaths.has(fingerprint)) {
      canonicalPaths.set(fingerprint, {
        pattern: `pattern_${fingerprint.substring(0, 8)}`,
        canonical_example: {
          url,
          page_id: canonicalPageId
        },
        variations: []
      });
    }
    
    // Add this as a variation
    canonicalPaths.get(fingerprint).variations.push({
      url,
      page_id: pageId
    });
    
    return;
  }
  
  // Mark this state as visited
  visitedStates.set(fingerprint, pageId);
  
  // Get LLM analysis of the page
  const pageContent = await page.content();
  const llmAnalysis = await getLlmGuidance(pageContent, url, 'analyze_page');
  
  // Create page object
  const pageObject = {
    id: pageId,
    url,
    title,
    fingerprint,
    screenshot: path.relative(process.cwd(), screenshotPath),
    parent_action: parentAction,
    depth: currentDepth,
    llm_analysis: llmAnalysis,
    actions: []
  };
  
  // Add page to results
  crawlResults.pages.push(pageObject);
  
  // If we've reached max depth, don't look for more actions
  if (currentDepth >= maxDepth) {
    return;
  }
  
  // Get interactive elements on the page
  const interactiveElements = await getInteractiveElements(page);
  
  // Log all interactive elements to help with debugging
  console.log('=== AVAILABLE INTERACTIVE ELEMENTS ===');
  console.log(`Found ${interactiveElements.length} interactive elements on the page`);
  interactiveElements.forEach((el, index) => {
    console.log(`Element ${index + 1}:`);
    console.log(`  Type: ${el.tagName}`);
    console.log(`  Text: ${el.text}`);
    console.log(`  Selector: ${el.selector}`);
    console.log(`  Href: ${el.href || 'N/A'}`);
    console.log(`  Position: (${el.position.x}, ${el.position.y})`);
    console.log('---');
  });
  
  // Get LLM guidance on which elements to interact with
  let elementGuidance;
  try {
    // Special case for product listing pages - directly find product links
    const isProductListingPage = url.includes('/jewellery/') || 
                                url.includes('/products/') || 
                                url.includes('/category/') || 
                                await page.evaluate(() => {
                                  // Check page title and content for listing indicators
                                  const title = document.title.toLowerCase();
                                  return title.includes('collection') || 
                                        title.includes('products') || 
                                        title.includes('pendants') || 
                                        title.includes('jewellery');
                                });
    
    if (isProductListingPage) {
      console.log('Detected product listing page, looking for product links...');
      
      // Try to find product links directly
      const productLinks = await findProductLinks(page);
      
      if (productLinks && productLinks.length > 0) {
        console.log(`Found ${productLinks.length} product links directly`);
        // Only select the first product link (most important one)
        elementGuidance = {
          suggestions: productLinks.slice(0, 1).map(link => ({
            selector: link.selector,
            action: 'click',
            text: link.text,
            type: 'a',
            reasoning: 'Direct product link from listing page - exploring only one product as representative'
          })),
          ignored_elements: []
        };
      } else {
        console.log('No product links found directly, falling back to LLM guidance');
        // Fall back to LLM guidance
        elementGuidance = await getLlmGuidance(
          pageContent, 
          url, 
          'suggest_interactions',
          interactiveElements
        );
      }
    } else {
      // Standard approach for non-product listing pages
      elementGuidance = await getLlmGuidance(
        pageContent, 
        url, 
        'suggest_interactions',
        interactiveElements
      );
    }
  } catch (error) {
    console.warn(`Error getting LLM guidance: ${error.message}`);
    // Use fallback if LLM guidance fails
    elementGuidance = {
      suggestions: [
        // Add some safe default interactions
        // Avoid login/payment elements
        ...interactiveElements
          .filter(el => {
            const text = (el.text || '').toLowerCase();
            const selector = (el.selector || '').toLowerCase();
            const avoidTerms = ['login', 'signin', 'sign in', 'register', 'checkout', 'payment', 'cart', 'password'];
            return !avoidTerms.some(term => text.includes(term) || selector.includes(term));
          })
          .slice(0, 5)
          .map(el => ({
            selector: el.selector,
            action: el.action || 'click',
            text: el.text || '',
            type: el.tagName,
            reasoning: 'Fallback interaction'
          }))
      ],
      ignored_elements: []
    };
  }
  
  // Process each suggested interaction
  for (const suggestion of elementGuidance.suggestions) {
    try {
      // Create a unique ID for this action
      const actionId = `action_${uuidv4()}`;
      
      // Take a screenshot before the action
      const beforeScreenshotPath = path.join(
        process.env.SCREENSHOT_DIR, 
        `${actionId}_before.png`
      );
      await page.screenshot({ path: beforeScreenshotPath, fullPage: true });
      
      // Skip highlighting for now - we'll just take screenshots before and after
      let highlightScreenshotPath = '';
      
      // Perform the action
      console.log(`Performing action: ${suggestion.action} on ${suggestion.selector}`);
      
      let actionResult = { success: false };
      
      // No delay needed for faster crawling
      
      // Perform different actions based on the element type
      switch (suggestion.action) {
        case 'click':
          await page.click(suggestion.selector);
          break;
        case 'fill':
          await page.fill(suggestion.selector, suggestion.value || '');
          break;
        case 'select':
          await page.selectOption(suggestion.selector, suggestion.value || '');
          break;
        // Add more action types as needed
      }
      
      // Wait briefly for navigation with reduced timeout
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      } catch (navigationError) {
        console.log('Continuing without waiting for full page load');
      }
      
      // Take a screenshot after the action
      const afterScreenshotPath = path.join(
        process.env.SCREENSHOT_DIR, 
        `${actionId}_after.png`
      );
      await page.screenshot({ path: afterScreenshotPath, fullPage: true });
      
      // Get the new URL after the action
      const newUrl = page.url();
      
      // Create action object
      const actionObject = {
        id: actionId,
        type: suggestion.action,
        element: {
          selector: suggestion.selector,
          text: suggestion.text,
          type: suggestion.type
        },
        screenshot_before: path.relative(process.cwd(), beforeScreenshotPath),
        screenshot_after: path.relative(process.cwd(), afterScreenshotPath),
        result_url: newUrl,
        success: true,
        llm_reasoning: suggestion.reasoning
      };
      
      // Add highlight screenshot if it exists
      if (highlightScreenshotPath) {
        actionObject.screenshot_highlight = path.relative(process.cwd(), highlightScreenshotPath);
      }
      
      // Add action to page
      pageObject.actions.push(actionObject);
      
      // If the URL changed, crawl the new page
      if (newUrl !== url) {
        await crawlPage(page, newUrl, currentDepth + 1, maxDepth, actionId);
        
        // Navigate back to the original page
        await page.goto(url, { waitUntil: 'networkidle' });
      }
    } catch (actionError) {
      console.error(`Error performing action: ${actionError.message}`);
      
      // Add failed action to page
      pageObject.actions.push({
        id: `action_${uuidv4()}`,
        type: suggestion.action,
        element: {
          selector: suggestion.selector,
          text: suggestion.text,
          type: suggestion.type
        },
        success: false,
        error: actionError.message,
        llm_reasoning: suggestion.reasoning
      });
    }
  }
  } catch (pageError) {
    console.error(`Error crawling page ${url}: ${pageError.message}`);
    // Continue with the crawl despite errors on individual pages
  }
}

/**
 * Find product links on a product listing page
 * @param {Page} page - Playwright page object
 * @returns {Array} - Array of product links with their selectors and text
 */
async function findProductLinks(page) {
  console.log('Searching for product links...');
  
  return page.evaluate(() => {
    const productLinks = [];
    
    // Log the current URL for debugging
    console.log(`Current page URL: ${window.location.href}`);
    
    // Common patterns for product links
    const productUrlPatterns = [
      /\/product\//i,
      /\/products\//i,
      /\/item\//i,
      /\/detail\//i,
      /\/pendants\//i,  // Specific to jewelry sites
      /\~\d+\.html/i,  // Common product ID pattern (like ~28249.html)
      /\/p\//i,        // Common product path
      /\?productId=/i  // Query parameter for product
    ];
    
    // Find all links on the page
    const allLinks = document.querySelectorAll('a');
    console.log(`Found ${allLinks.length} total links on the page`);
    
    // Check each link to see if it matches product patterns
    allLinks.forEach((link, index) => {
      const href = link.getAttribute('href');
      if (!href) return;
      
      // Check if this link matches any product URL pattern
      const isProductLink = productUrlPatterns.some(pattern => pattern.test(href));
      
      // Also check for specific pendant link
      const isTargetPendant = href.includes('/pendants/the-circinus-pendant~28249.html');
      
      if (isProductLink || isTargetPendant) {
        // Get a unique selector for this link
        let selector = '';
        if (link.id) {
          selector = `#${link.id}`;
        } else if (link.className) {
          selector = `a.${link.className.split(' ').join('.')}`;
        } else {
          // Use attribute selector for href
          selector = `a[href*="${href.split('/').pop()}"]`;
        }
        
        // Get text content
        const text = link.innerText || link.textContent || '';
        
        // Get position
        const rect = link.getBoundingClientRect();
        
        // Check if element is visible
        const isVisible = (
          rect.width > 0 && 
          rect.height > 0 && 
          getComputedStyle(link).display !== 'none' && 
          getComputedStyle(link).visibility !== 'hidden'
        );
        
        if (isVisible) {
          productLinks.push({
            href,
            selector,
            text: text.trim(),
            position: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            isTargetPendant
          });
          
          console.log(`Found visible product link: ${href}`);
        } else {
          console.log(`Skipping invisible product link: ${href}`);
        }
      }
    });
    
    // Sort by priority (target pendant first, then by vertical position)
    productLinks.sort((a, b) => {
      if (a.isTargetPendant && !b.isTargetPendant) return -1;
      if (!a.isTargetPendant && b.isTargetPendant) return 1;
      return a.position.y - b.position.y;
    });
    
    return productLinks;
  });
}

/**
 * Get all interactive elements on the page
 */
async function getInteractiveElements(page) {
  return page.evaluate(() => {
    const elements = [];
    
    // Find all potentially interactive elements
    const interactiveSelectors = [
      'a', 'button', 'input', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="checkbox"]',
      '[role="radio"]', '[role="tab"]', '[role="menuitem"]',
      '[onclick]', '[tabindex]'
    ];
    
    const potentialElements = document.querySelectorAll(interactiveSelectors.join(','));
    
    potentialElements.forEach((el, index) => {
      // Skip hidden elements
      if (el.offsetParent === null && !['fixed', 'sticky'].includes(getComputedStyle(el).position)) {
        return;
      }
      
      // Get element properties
      const rect = el.getBoundingClientRect();
      const tagName = el.tagName.toLowerCase();
      const type = el.getAttribute('type') || '';
      const role = el.getAttribute('role') || '';
      const text = el.innerText || el.value || el.placeholder || '';
      const id = el.id || '';
      const classes = Array.from(el.classList).join(' ');
      const name = el.getAttribute('name') || '';
      const href = el.getAttribute('href') || '';
      
      // Generate a unique selector for this element
      let selector = '';
      if (id) {
        selector = `#${id}`;
      } else if (name) {
        selector = `[name="${name}"]`;
      } else {
        // Create a more complex selector
        selector = `${tagName}`;
        if (classes) {
          selector += `.${classes.split(' ').join('.')}`;
        }
        // Add nth-child if needed
        if (!id && !name && !classes) {
          const siblings = Array.from(el.parentNode.children).filter(c => c.tagName === el.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(el) + 1;
            selector += `:nth-child(${index})`;
          }
        }
      }
      
      // Determine the appropriate action for this element
      let action = 'click';
      if (tagName === 'input') {
        if (['text', 'email', 'password', 'number', 'search', 'tel', 'url'].includes(type)) {
          action = 'fill';
        } else if (['checkbox', 'radio'].includes(type)) {
          action = 'click';
        }
      } else if (tagName === 'select') {
        action = 'select';
      } else if (tagName === 'textarea') {
        action = 'fill';
      }
      
      elements.push({
        index,
        tagName,
        type,
        role,
        text: text.trim().substring(0, 100),
        id,
        classes,
        name,
        href,
        selector,
        position: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        visible: rect.width > 0 && rect.height > 0,
        action
      });
    });
    
    return elements;
  });
}

/**
 * Process canonical paths from the collected data
 */
function processCanonicalPaths() {
  const canonicalPathsArray = [];
  
  for (const [fingerprint, pathData] of canonicalPaths.entries()) {
    canonicalPathsArray.push({
      pattern: pathData.pattern,
      canonical_example: pathData.canonical_example,
      variations_detected: pathData.variations.length,
      variation_examples: pathData.variations.slice(0, 5).map(v => v.url)
    });
  }
  
  crawlResults.canonical_paths = canonicalPathsArray;
}

module.exports = {
  startCrawler
};
