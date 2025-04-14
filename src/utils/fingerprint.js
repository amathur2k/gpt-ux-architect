const crypto = require('crypto');

/**
 * Generate a fingerprint for a page to identify similar pages
 * @param {Page} page - Playwright page object
 * @returns {string} - Fingerprint hash
 */
async function generatePageFingerprint(page) {
  // Extract key information from the page
  const pageData = await page.evaluate(() => {
    // Get URL without query parameters and hash
    const urlPattern = window.location.origin + 
      window.location.pathname.replace(/\/\d+\/?$/, '/{id}/');
    
    // Get interactive elements structure (without specific content)
    const interactiveElements = Array.from(document.querySelectorAll(
      'a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"]'
    )).map(el => {
      const rect = el.getBoundingClientRect();
      return {
        tagName: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        role: el.getAttribute('role') || '',
        position: {
          x: Math.round(rect.x / 10) * 10, // Round to nearest 10px
          y: Math.round(rect.y / 10) * 10  // Round to nearest 10px
        },
        hasChildren: el.children.length > 0
      };
    });
    
    // Get page layout structure
    const layoutElements = Array.from(document.querySelectorAll(
      'header, footer, nav, main, aside, section, article'
    )).map(el => {
      const rect = el.getBoundingClientRect();
      return {
        tagName: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '',
        position: {
          x: Math.round(rect.x / 10) * 10,
          y: Math.round(rect.y / 10) * 10,
          width: Math.round(rect.width / 10) * 10,
          height: Math.round(rect.height / 10) * 10
        }
      };
    });
    
    // Get meta information
    const metaTags = Array.from(document.querySelectorAll('meta[name], meta[property]'))
      .map(meta => ({
        name: meta.getAttribute('name') || meta.getAttribute('property'),
        content: meta.getAttribute('content')
      }))
      .filter(meta => 
        meta.name.includes('type') || 
        meta.name.includes('template') || 
        meta.name.includes('page')
      );
    
    return {
      urlPattern,
      title: document.title,
      interactiveElements,
      layoutElements,
      metaTags
    };
  });
  
  // Create a fingerprint from the page data
  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      urlPattern: pageData.urlPattern,
      layoutElements: pageData.layoutElements,
      interactiveElementsCount: pageData.interactiveElements.length,
      // Include a simplified representation of interactive elements
      interactiveElementTypes: pageData.interactiveElements.map(el => 
        `${el.tagName}:${el.type || 'none'}:${el.position.x}:${el.position.y}`
      ).sort().join(',')
    }))
    .digest('hex');
  
  return fingerprint;
}

/**
 * Normalize a URL to create a pattern
 * @param {string} url - URL to normalize
 * @returns {string} - Normalized URL pattern
 */
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    
    // Remove query parameters
    urlObj.search = '';
    
    // Remove hash
    urlObj.hash = '';
    
    // Replace numeric segments in path with {id}
    const pathParts = urlObj.pathname.split('/');
    const normalizedParts = pathParts.map(part => {
      // If the part is purely numeric, replace with {id}
      if (/^\d+$/.test(part)) {
        return '{id}';
      }
      
      // If the part contains both letters and numbers in a pattern like "product-123"
      if (/^[a-zA-Z]+-\d+$/.test(part)) {
        return part.replace(/-\d+$/, '-{id}');
      }
      
      return part;
    });
    
    urlObj.pathname = normalizedParts.join('/');
    
    return urlObj.toString();
  } catch (error) {
    console.error(`Error normalizing URL ${url}: ${error.message}`);
    return url;
  }
}

module.exports = {
  generatePageFingerprint,
  normalizeUrl
};
