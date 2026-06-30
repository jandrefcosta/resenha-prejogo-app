import { chromium } from 'playwright';

const OUT = process.argv[2] || 'bracket.png';
const URL = 'http://localhost:3137/copa-2026';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 860, height: 1400 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });

// Open the bracket modal
await page.getByRole('button', { name: /chaveamento/i }).first().click();

// Wait for the dialog, then for loading text to disappear
const dialog = page.getByRole('dialog', { name: /chaveamento/i });
await dialog.waitFor({ state: 'visible', timeout: 10000 });

// Wait until either tree content or an end-state appears
await page.waitForFunction(() => {
  const d = document.querySelector('[role="dialog"][aria-label*="Chaveamento"]');
  if (!d) return false;
  const t = d.textContent || '';
  return !t.includes('Carregando chaveamento');
}, { timeout: 20000 });

await page.waitForTimeout(800); // let logos settle

// Report what's in the tree
const info = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"][aria-label*="Chaveamento"]');
  const headers = [...d.querySelectorAll('div')].filter((el) => /avos|Oitavas|Quartas|Semi|Final|Lugar/.test(el.textContent || '') && el.offsetWidth < 200 && el.className.includes('uppercase')).map((el) => el.textContent.trim());
  const cards = d.querySelectorAll('svg + div, [style*="left:"]');
  return { state: d.textContent.slice(0, 60), headers };
});
console.log('TREE INFO:', JSON.stringify(info));
console.log('CONSOLE ERRORS:', JSON.stringify(errors));

// Screenshot the panel (second child of dialog; first is backdrop)
const panel = dialog.locator('> div').nth(1);
await panel.screenshot({ path: OUT });
console.log('SAVED', OUT);

await browser.close();
