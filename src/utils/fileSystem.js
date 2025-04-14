const fs = require('fs').promises;
const path = require('path');

/**
 * Ensure a directory exists, creating it if necessary
 * @param {string} dirPath - Path to the directory
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

/**
 * Generate a safe filename from a URL
 * @param {string} url - URL to convert to filename
 * @returns {string} - Safe filename
 */
function urlToFilename(url) {
  try {
    const urlObj = new URL(url);
    
    // Combine hostname and pathname
    let filename = `${urlObj.hostname}${urlObj.pathname}`;
    
    // Replace invalid characters
    filename = filename.replace(/[^a-zA-Z0-9]/g, '_');
    
    // Trim to reasonable length
    if (filename.length > 100) {
      filename = filename.substring(0, 100);
    }
    
    return filename;
  } catch (error) {
    // Fallback for invalid URLs
    return url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
  }
}

module.exports = {
  ensureDirectoryExists,
  urlToFilename
};
