/**
 * Test runner script for UX Crawler
 * 
 * This script runs all tests and reports their status
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Get all test files
const testsDir = path.join(__dirname);
const testFiles = fs.readdirSync(testsDir)
  .filter(file => file.startsWith('test-') && file.endsWith('.js'));

console.log(`${colors.cyan}Running ${testFiles.length} tests...${colors.reset}\n`);

// Results tracking
const results = {
  passed: [],
  failed: []
};

// Run each test
testFiles.forEach((testFile, index) => {
  const testName = testFile.replace('.js', '');
  const testPath = path.join(testsDir, testFile);
  
  console.log(`${colors.yellow}[${index + 1}/${testFiles.length}] Running ${testName}...${colors.reset}`);
  
  try {
    // Create a log file for the test output
    const logFile = path.join(testsDir, `${testName}-log.txt`);
    
    // Run the test and capture its output
    execSync(`node ${testPath} > ${logFile} 2>&1`);
    
    // Read the log file to check for success/failure
    const log = fs.readFileSync(logFile, 'utf8');
    
    if (log.includes('❌ Test FAILED')) {
      results.failed.push({ name: testName, log });
      console.log(`${colors.red}✖ ${testName} FAILED${colors.reset}`);
    } else if (log.includes('✅ Test PASSED')) {
      results.passed.push({ name: testName });
      console.log(`${colors.green}✓ ${testName} PASSED${colors.reset}`);
    } else {
      // If we can't determine the status, consider it failed
      results.failed.push({ name: testName, log, reason: 'Could not determine test status' });
      console.log(`${colors.red}? ${testName} UNKNOWN STATUS (treating as FAILED)${colors.reset}`);
    }
  } catch (error) {
    results.failed.push({ name: testName, error: error.message });
    console.log(`${colors.red}✖ ${testName} FAILED with error: ${error.message}${colors.reset}`);
  }
  
  console.log(''); // Add a blank line between tests
});

// Print summary
console.log(`${colors.cyan}=== Test Summary ===${colors.reset}`);
console.log(`${colors.green}Passed: ${results.passed.length}${colors.reset}`);
console.log(`${colors.red}Failed: ${results.failed.length}${colors.reset}`);

// Print details of failed tests
if (results.failed.length > 0) {
  console.log(`\n${colors.red}=== Failed Tests ===${colors.reset}`);
  results.failed.forEach((test, index) => {
    console.log(`${colors.red}${index + 1}. ${test.name}${colors.reset}`);
    if (test.reason) {
      console.log(`   Reason: ${test.reason}`);
    }
    if (test.error) {
      console.log(`   Error: ${test.error}`);
    }
    console.log(`   See ${test.name}-log.txt for details`);
  });
}

// Exit with appropriate code
process.exit(results.failed.length > 0 ? 1 : 0);
