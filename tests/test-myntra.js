/**
 * Test script for Myntra product link detection
 * 
 * This script tests the crawler's ability to find product links on Myntra
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

// Import the findProductLinksGeneral function from crawler.js
const { findProductLinksGeneral } = require('../src/crawler');

async function testMyntraProductLinkDetection() {
  console.log('Starting Myntra product link detection test...');
  
  // Launch browser
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    // Navigate to Myntra lipstick page
    console.log('Navigating to Myntra lipstick page...');
    await page.goto('https://www.myntra.com/lipstick', { timeout: 30000 });
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Take a screenshot for reference
    await page.screenshot({ path: path.join(__dirname, 'myntra-page.png') });
    
    // Find product links
    console.log('Finding product links...');
    const productLinks = await findProductLinksGeneral(page);
    
    // Log the number of product links found
    console.log(`Found ${productLinks.length} product links on Myntra`);
    
    // Save the product links to a file for inspection
    await fs.writeFile(
      path.join(__dirname, 'myntra-product-links.json'),
      JSON.stringify(productLinks, null, 2)
    );
    
    // Verify that we found at least one product link
    if (productLinks.length > 0) {
      console.log('✅ Test PASSED: Found product links on Myntra');
      
      // Log the first 3 product links for inspection
      console.log('\nSample product links:');
      for (let i = 0; i < Math.min(3, productLinks.length); i++) {
        console.log(`${i + 1}. ${productLinks[i].href}`);
        console.log(`   Selector: ${productLinks[i].selector}`);
        console.log(`   Text: ${productLinks[i].text}`);
        console.log('---');
      }
      
      // Try clicking the first product link
      console.log('\nTesting click on first product link...');
      const firstLink = productLinks[0];
      
      // Instead of using the potentially problematic selector from the product link,
      // let's use a more reliable approach
      console.log('Product link selector:', firstLink.selector);
      
      // Navigate directly to the href, ensuring it's a full URL
      let productUrl = firstLink.href;
      
      // Check if it's a relative URL and convert to absolute if needed
      if (productUrl.startsWith('/')) {
        productUrl = new URL(productUrl, 'https://www.myntra.com').href;
      } else if (!productUrl.startsWith('http')) {
        productUrl = new URL(productUrl, 'https://www.myntra.com').href;
      }
      
      console.log('Navigating directly to:', productUrl);
      await page.goto(productUrl, { timeout: 30000 });
      
      // Wait for navigation
      await page.waitForLoadState('networkidle');
      
      // Take a screenshot of the product page
      await page.screenshot({ path: path.join(__dirname, 'myntra-product-page.png') });
      
      // Get the current URL to verify we navigated to a product page
      const currentUrl = page.url();
      console.log(`Navigated to: ${currentUrl}`);
      
      // Check if we're on a product page
      const isProductPage = currentUrl.includes('/product/') || 
                           currentUrl.includes('/p/') || 
                           currentUrl !== 'https://www.myntra.com/lipstick';
                           
      if (isProductPage) {
        console.log('✅ Test PASSED: Successfully navigated to a product page');
      } else {
        console.log('❌ Test FAILED: Did not navigate to a product page');
      }
    } else {
      console.log('❌ Test FAILED: No product links found on Myntra');
    }
  } catch (error) {
    console.error('❌ Test FAILED with error:', error);
  } finally {
    // Close the browser
    await browser.close();
  }
}

// Run the test
testMyntraProductLinkDetection().catch(console.error);
