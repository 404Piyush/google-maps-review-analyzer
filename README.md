# Google Maps Review Analyzer

This project is a Node.js-based web scraper that extracts reviews for a specific location from Google Maps, performs a topic and sentiment analysis on them, and generates a detailed report in Markdown format.

It uses `puppeteer-extra` with the `stealth` plugin to avoid bot detection and rotates through a list of proxies to handle IP blocks and CAPTCHAs.

## Features

-   **Stealthy Scraping**: Navigates Google Maps avoiding bot-detection using Puppeteer Stealth.
-   **Proxy Rotation**: Automatically cycles through a list of proxies to avoid rate-limiting and IP bans.
-   **Dynamic Scrolling**: Intelligently scrolls the reviews page to load all available reviews.
-   **Data Extraction**: Parses review data including the author's name, post time, star rating, and review text.
-   **Automated Analysis**: Runs a follow-up script (`topic-analysis.js`) to perform sentiment and topic analysis on the extracted reviews.
-   **Report Generation**: Creates a final `analysis-report.md` with a summary of the findings.

## Technologies Used

-   **Node.js**
-   **Puppeteer-extra** & **puppeteer-extra-plugin-stealth**
-   **Axios** (for the analysis script)
-   **Ollama** (for the analysis script)

## Prerequisites

-   Node.js (v18 or higher recommended)
-   NPM

## Setup and Configuration

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd google-maps-review-analyzer
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create and configure `proxies.txt`:**

    This project requires proxies to function correctly and bypass Google's security.

    -   Create a file named `proxies.txt` in the root of the project.
    -   Add your proxy servers to this file, one per line.
    -   The required format is `http://username:password@host:port`.

    **Example `proxies.txt`:**
    ```
    http://user1:pass1@proxy.example.com:8080
    http://user2:pass2@proxy.example.com:8081
    ```
    > **Note:** The `proxies.txt` file is included in `.gitignore` and will not be committed to the repository.

## Usage

Once the setup is complete, you can run the main script from the project's root directory:

```bash
node index.js
```

The script will perform the following actions:
1.  Launch a Puppeteer browser using a proxy from `proxies.txt`.
2.  Navigate to the specified Google Maps URL.
3.  Click through to the reviews section and scroll to load all of them.
4.  Save the raw HTML to `reviews.html` and the extracted data to `reviews.json`.
5.  Automatically trigger the `topic-analysis.js` script to generate the `analysis-report.md`.

## Output Files

-   `reviews.json`: A JSON array of the extracted review objects.
-   `reviews.html`: The raw HTML of the final reviews page for debugging.
-   `intermediate-analysis.json`: A temporary file from the analysis script.
-   `analysis-report.md`: The final, generated report with insights from the reviews.
-   `screenshots/`: Contains screenshots of CAPTCHA pages or successful runs for debugging. 