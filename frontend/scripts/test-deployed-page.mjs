import { chromium } from 'playwright';
import path from 'path';

async function testSite() {
  console.log('Launching headless Chrome to test https://careyu-frontend.pages.dev/login...');
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome'
  });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[PAGE ERROR] ${err.message}`));

  await page.goto('https://careyu-frontend.pages.dev/login', { waitUntil: 'networkidle' });

  const title = await page.title();
  console.log('Page Title:', title);

  const inputs = await page.$$eval('input', els => els.map(el => ({
    name: el.name,
    type: el.type,
    placeholder: el.placeholder
  })));
  console.log('Input fields found:', JSON.stringify(inputs));

  const artifactPath = path.resolve('C:/Users/Kabitha/.gemini/antigravity-ide/brain/18b278bc-1fa9-4b03-8735-47c0abc87780/login_screenshot.png');
  await page.screenshot({ path: artifactPath, fullPage: true });
  console.log('Screenshot saved to:', artifactPath);

  console.log('Browser console logs:');
  consoleLogs.forEach(l => console.log(l));

  await browser.close();
}

testSite().catch(err => {
  console.error('Error running test:', err);
  process.exit(1);
});
