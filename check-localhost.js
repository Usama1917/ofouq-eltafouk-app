const { chromium } = require('/private/tmp/pw-check/node_modules/playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`[Console Error] ${msg.text()}`);
    }
  });

  page.on('pageerror', exception => {
    errors.push(`[Uncaught Exception] ${exception}`);
  });

  page.on('requestfailed', request => {
    if(request.url().includes('localhost')) {
      errors.push(`[Network Error] ${request.url()} failed`);
    }
  });

  try {
    const response = await page.goto('http://localhost:18937', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(2000);
    
    if (response && !response.ok()) {
      errors.push(`[HTTP Error] Status: ${response.status()} ${response.statusText()}`);
    }
    
    await page.screenshot({ path: '/Users/macminiosama/ofouq-eltafouk-app/screenshot.png', fullPage: true });
  } catch (err) {
    errors.push(`[Navigation Error] ${err.message}`);
  }

  const result = {
    url: 'http://localhost:18937',
    screenshotPath: '/Users/macminiosama/ofouq-eltafouk-app/screenshot.png',
    errors: errors,
  };

  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
