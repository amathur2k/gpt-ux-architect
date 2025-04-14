#!/usr/bin/env node

require('dotenv').config();
const { startCrawler } = require('./src/crawler');
const { validateConfig } = require('./src/utils/config');

async function main() {
  try {
    // Validate configuration
    validateConfig();
    
    // Start the crawler
    console.log('Starting UX Crawler...');
    console.log(`Target URL: ${process.env.TARGET_URL}`);
    console.log(`Max Depth: ${process.env.MAX_DEPTH}`);
    
    await startCrawler();
    
    console.log('Crawl completed successfully!');
    console.log(`Results saved to: ${process.env.OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error running UX Crawler:', error.message);
    process.exit(1);
  }
}

main();
