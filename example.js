require('dotenv').config();
const { startCrawler } = require('./src/crawler');

// Override environment variables for this example
process.env.TARGET_URL = 'https://www.bluestone.com/jewellery/pendants.html'; // Bluestone pendants page
process.env.MAX_DEPTH = '1'; // Limit depth to just one product page
process.env.CRAWL_DELAY = '2'; // Increased delay to be more respectful to the site

// Avoid login/payment flows
process.env.AVOID_TERMS = 'login,signin,register,checkout,payment,cart,password,buy,price'; // Terms to avoid in selectors and text

async function runExample() {
  console.log('Starting UX Crawler Example...');
  console.log(`Target URL: ${process.env.TARGET_URL}`);
  console.log(`Max Depth: ${process.env.MAX_DEPTH}`);
  
  try {
    const results = await startCrawler();
    console.log('Crawl completed successfully!');
    console.log(`Results saved to: ${process.env.OUTPUT_FILE}`);
    
    // Print some statistics
    console.log(`Pages crawled: ${results.pages.length}`);
    console.log(`Canonical paths identified: ${results.canonical_paths.length}`);
    
    const totalActions = results.pages.reduce((sum, page) => sum + page.actions.length, 0);
    console.log(`Total actions performed: ${totalActions}`);
  } catch (error) {
    console.error('Error running example:', error.message);
  }
}

runExample();
