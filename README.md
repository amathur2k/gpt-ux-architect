# UX Crawler

An intelligent website crawler that automates UX testing by exploring and documenting all possible user interactions. The tool uses Playwright for browser automation and OpenAI's GPT models to guide the crawling process with human-like decision making.

## Features

- **LLM-Guided Exploration**: Uses AI to make intelligent decisions about which elements to interact with
- **Full Page Screenshots**: Captures comprehensive visual documentation of each state
- **Smart Canonical Path Detection**: Identifies and avoids redundant exploration of similar pages
- **Detailed JSON Output**: Documents all interactions in a machine-parsable format
- **UX Analysis**: Includes AI-generated observations about potential UX issues

## Prerequisites

- Node.js (v14 or higher)
- An OpenAI API key

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Copy the `.env.example` file to `.env` and fill in your configuration:

```bash
cp .env.example .env
```

4. Edit the `.env` file with your OpenAI API key and target website:

```
OPENAI_API_KEY=your_openai_api_key_here
TARGET_URL=https://example.com
MAX_DEPTH=3
```

## Usage

Run the crawler with:

```bash
node index.js
```

The crawler will:
1. Start a browser and navigate to your target URL
2. Analyze the page using the LLM
3. Identify and perform meaningful interactions
4. Capture screenshots before and after each action
5. Generate a detailed JSON report of all findings

## Configuration Options

In the `.env` file, you can configure:

- `TARGET_URL`: The website to crawl
- `MAX_DEPTH`: Maximum depth of interactions to explore
- `OPENAI_API_KEY`: Your OpenAI API key
- `SCREENSHOT_DIR`: Directory to save screenshots (default: ./screenshots)
- `OUTPUT_FILE`: Path for the JSON output file (default: ./ux-report.json)
- `CRAWL_DELAY`: Delay between actions in milliseconds (default: 500)
- `VIEWPORT_WIDTH/HEIGHT`: Browser viewport dimensions
- `MOBILE_VIEWPORT_WIDTH/HEIGHT`: Mobile viewport dimensions for responsive testing

## Output Format

The tool generates a JSON file with the following structure:

```json
{
  "site_info": {
    "base_url": "https://example.com",
    "crawl_date": "2025-04-14T15:09:32+05:30",
    "crawl_depth": 3
  },
  "pages": [
    {
      "id": "page_1",
      "url": "https://example.com",
      "title": "Homepage",
      "screenshot": "screenshots/page_1_initial.png",
      "llm_analysis": {
        "page_type": "home_page",
        "primary_purpose": "Introduce the company and its products",
        "key_components": ["navigation", "hero section", "product cards"],
        "ux_observations": ["Navigation is clear", "CTA is prominent"],
        "suggested_improvements": ["Add search functionality"]
      },
      "actions": [
        {
          "id": "action_1",
          "type": "click",
          "element": {
            "selector": "#login-btn",
            "text": "Login",
            "type": "button"
          },
          "screenshot_before": "screenshots/action_1_before.png",
          "screenshot_highlight": "screenshots/action_1_highlight.png",
          "screenshot_after": "screenshots/action_1_after.png",
          "result_url": "https://example.com/login",
          "success": true,
          "llm_reasoning": "Login is a primary user flow that should be tested"
        }
      ]
    }
  ],
  "canonical_paths": [
    {
      "pattern": "product_detail",
      "canonical_example": {
        "url": "https://example.com/products/123",
        "page_id": "page_2"
      },
      "variations_detected": 5,
      "variation_examples": [
        "https://example.com/products/456",
        "https://example.com/products/789"
      ]
    }
  ]
}
```

## Using the Results

The JSON output and screenshots can be used to:

1. Identify UX issues and improvement opportunities
2. Document the complete user flow through your website
3. Create visual user journey maps
4. Analyze the site structure and navigation patterns
5. Compare before/after screenshots when making UX changes

## Limitations

- The crawler requires an OpenAI API key and will incur API usage costs
- JavaScript-heavy sites with complex interactions may require additional configuration
- The tool respects robots.txt by default, which may limit crawling on some sites
- Login-protected areas require additional configuration

## License

MIT
