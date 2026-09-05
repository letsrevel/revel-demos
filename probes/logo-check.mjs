import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

// Scene 1: anonymous landing page, hydration, banner-hide selector, slow-scroll room
await page.goto(BASE + '/');
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
await page.waitForLoadState('networkidle');
console.log('landing: hydrated + networkidle OK');
const banners = await page.locator('div[role="alert"]:has(a[href*="mailpit"])').count();
console.log('demo banner present (will be hidden):', banners);
const scrollable = await page.evaluate(
	() => document.documentElement.scrollHeight - window.innerHeight
);
if (scrollable < 900) throw new Error(`not enough page to scroll 900px (have ${scrollable})`);
await page.mouse.wheel(0, 900);
await page.waitForTimeout(500);
console.log('slow-scroll room: OK (', scrollable, 'px available )');

// Scene 2: the outro asset — the exact data URI from the manifest must render
const scenes = JSON.parse(readFileSync(new URL('../demos/logo-check.scenes.json', import.meta.url), 'utf8'));
const outro = scenes.find((s) => s.scene === 'outro');
const dataUri = outro.overlay.props.logo;
if (!dataUri.startsWith('data:image/png;base64,')) throw new Error('logo prop is not a data URI');
await page.goto('about:blank');
await page.evaluate((src) => {
	document.body.innerHTML = `<img id="probe-logo" src="${src}" />`;
}, dataUri);
const dims = await page
	.locator('#probe-logo')
	.evaluate(
		(img) =>
			new Promise((resolve, reject) => {
				if (img.complete && img.naturalWidth > 0)
					return resolve([img.naturalWidth, img.naturalHeight]);
				img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
				img.onerror = () => reject(new Error('logo data URI failed to decode'));
			})
	);
console.log('outro logo decodes in-page:', dims[0] + 'x' + dims[1]);
if (dims[0] !== 1024 || dims[1] !== 1024) throw new Error('unexpected logo dimensions');

await browser.close();
console.log('PROBE PASSED');
