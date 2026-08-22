const { webkit, devices } = require('playwright');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
  });
  const page = await context.newPage();

  console.log("Navigating to videasy...");
  // Using tmdb ID 550 (Fight Club)
  await page.goto('https://player.videasy.to/movie/550', { waitUntil: 'domcontentloaded' });

  // Wait a bit for JS to execute
  await page.waitForTimeout(3000);

  console.log("Extracting frames...");
  const frames = page.frames();
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    try {
      const url = f.url();
      const videoCount = await f.locator('video').count();
      console.log(`Frame ${i}: ${url} - Videos: ${videoCount}`);
      if (videoCount > 0) {
          const videoSrc = await f.locator('video').getAttribute('src');
          console.log(`  -> Video SRC: ${videoSrc}`);
      }
    } catch (e) {
      console.log(`Frame ${i}: ERROR - ${e.message}`);
    }
  }

  await browser.close();
})();
