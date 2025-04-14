/**
 * Validate the configuration from environment variables
 * @throws {Error} If configuration is invalid
 */
function validateConfig() {
  const requiredVars = [
    'OPENAI_API_KEY',
    'TARGET_URL',
    'MAX_DEPTH',
    'SCREENSHOT_DIR',
    'OUTPUT_FILE'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
  
  // Validate URL format
  try {
    new URL(process.env.TARGET_URL);
  } catch (error) {
    throw new Error(`Invalid TARGET_URL: ${process.env.TARGET_URL}`);
  }
  
  // Validate numeric values
  const numericVars = [
    'MAX_DEPTH',
    'CRAWL_DELAY',
    'VIEWPORT_WIDTH',
    'VIEWPORT_HEIGHT',
    'MOBILE_VIEWPORT_WIDTH',
    'MOBILE_VIEWPORT_HEIGHT'
  ];
  
  for (const varName of numericVars) {
    if (process.env[varName] && isNaN(parseInt(process.env[varName], 10))) {
      throw new Error(`Invalid numeric value for ${varName}: ${process.env[varName]}`);
    }
  }
  
  // Set defaults for optional variables
  if (!process.env.CRAWL_DELAY) {
    process.env.CRAWL_DELAY = '500';
  }
  
  if (!process.env.VIEWPORT_WIDTH) {
    process.env.VIEWPORT_WIDTH = '1280';
  }
  
  if (!process.env.VIEWPORT_HEIGHT) {
    process.env.VIEWPORT_HEIGHT = '800';
  }
  
  if (!process.env.MOBILE_VIEWPORT_WIDTH) {
    process.env.MOBILE_VIEWPORT_WIDTH = '375';
  }
  
  if (!process.env.MOBILE_VIEWPORT_HEIGHT) {
    process.env.MOBILE_VIEWPORT_HEIGHT = '667';
  }
}

module.exports = {
  validateConfig
};
