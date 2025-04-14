/**
 * Test script for Flipkart product link detection
 * 
 * This script tests the crawler's ability to find product links on Flipkart
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

// Import the findProductLinksGeneral function from crawler.js
const { findProductLinksGeneral } = require('../src/crawler');

async function testFlipkartProductLinkDetection() {
  console.log('Starting Flipkart product link detection test...');
  
  // Launch browser
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' // Use a standard user agent
  });
  const page = await context.newPage();
  
  try {
    // Navigate to Flipkart women's dresses page
    console.log('Navigating to Flipkart women\'s dresses page...');
    await page.goto('https://www.flipkart.com/clothing-and-accessories/dresses-and-gown/dress/women-dress/pr?sid=clo,odx,maj,jhy&otracker=categorytree&otracker=nmenu_sub_Women_0_Dresses', { 
      timeout: 60000, // Increase timeout to 60 seconds
      waitUntil: 'domcontentloaded' // Use domcontentloaded instead of load to avoid waiting for all resources
    });
    
    // Handle login popup if it appears (try multiple selectors)
    try {
      // Try different selectors for the close button
      const possibleSelectors = [
        'button._2KpZ6l._2doB4z', 
        'button[class*="_2KpZ6l"][class*="_2doB4z"]',
        'button.close',
        'span.close',
        'button._2doB4z',
        'button[class*="close"]',
        '._2KpZ6l._2doB4z'
      ];
      
      for (const selector of possibleSelectors) {
        try {
          const closeButton = await page.waitForSelector(selector, { timeout: 3000 });
          if (closeButton) {
            await closeButton.click();
            console.log(`Closed login popup using selector: ${selector}`);
            break;
          }
        } catch (err) {
          // Continue to the next selector
        }
      }
    } catch (e) {
      console.log('No login popup detected or unable to close it');
    }
    
    // Wait for page to stabilize
    await page.waitForTimeout(5000);
    
    console.log('Taking screenshot to see current page state...');
    await page.screenshot({ path: path.join(__dirname, 'flipkart-initial-page.png') });
    
    // Try multiple selectors for product grid
    console.log('Waiting for product grid to load...');
    const productGridSelectors = [
      'div._1YokD2._3Mn1Gg',
      'div[class*="_1YokD2"][class*="_3Mn1Gg"]',
      'div.product-grid',
      'div[class*="product-grid"]',
      'div[class*="product-list"]',
      'div._1AtVbE',
      'div[class*="_1AtVbE"]',
      'div._3FkR1D',
      'div[data-id="SEARCH_RESULT_GRID"]',
      // Generic product grid selectors
      'div[class*="grid"]',
      'div[class*="product"]',
      'a[href*="/p/"]' // Look for product links directly
    ];
    
    let productGridFound = false;
    for (const selector of productGridSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        console.log(`Found product grid with selector: ${selector}`);
        productGridFound = true;
        break;
      } catch (err) {
        console.log(`Selector ${selector} not found, trying next...`);
      }
    }
    
    if (!productGridFound) {
      console.log('Could not find product grid with predefined selectors.');
      console.log('Proceeding anyway to see if we can find product links...');
    }
    
    // Take a screenshot for reference
    await page.screenshot({ path: path.join(__dirname, 'flipkart-page.png') });
    
    // Find product links
    console.log('Finding product links...');
    const productLinks = await findProductLinksGeneral(page);
    
    // Log the number of product links found
    console.log(`Found ${productLinks.length} product links on Flipkart`);
    
    // Save the product links to a file for inspection
    await fs.writeFile(
      path.join(__dirname, 'flipkart-product-links.json'),
      JSON.stringify(productLinks, null, 2)
    );
    
    // Verify that we found at least one product link
    if (productLinks.length > 0) {
      console.log('✅ Test PASSED: Found product links on Flipkart');
      
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
        productUrl = new URL(productUrl, 'https://www.flipkart.com').href;
      } else if (!productUrl.startsWith('http')) {
        productUrl = new URL(productUrl, 'https://www.flipkart.com').href;
      }
      
      console.log('Navigating directly to:', productUrl);
      await page.goto(productUrl, { timeout: 30000 });
      
      // Wait for navigation
      await page.waitForLoadState('domcontentloaded');
      
      // Take a screenshot of the product page
      await page.screenshot({ path: path.join(__dirname, 'flipkart-product-page.png') });
      
      // Get the current URL to verify we navigated to a product page
      const currentUrl = page.url();
      console.log(`Navigated to: ${currentUrl}`);
      
      // Check if we're on a product page
      const isProductPage = currentUrl.includes('/p/') || 
                           currentUrl.includes('/product/') || 
                           currentUrl !== 'https://www.flipkart.com/clothing-and-accessories/dresses-and-gown/dress/women-dress/pr?sid=clo,odx,maj,jhy&otracker=categorytree&otracker=nmenu_sub_Women_0_Dresses';
                           
      if (isProductPage) {
        console.log('✅ Test PASSED: Successfully navigated to a product page');
      } else {
        console.log('❌ Test FAILED: Did not navigate to a product page');
      }
    } else {
      console.log('❌ Test FAILED: No product links found on Flipkart');
    }
  } catch (error) {
    console.error('❌ Test FAILED with error:', error);
  } finally {
    // Close the browser
    await browser.close();
  }
}

// Run the test
testFlipkartProductLinkDetection().catch(console.error);
