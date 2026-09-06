// Verifies the interstitial cover actually dissolves rather than vanishing.
//   npx playwright test -c probes/endcard.config.ts probes/dissolve.check.ts
import { test, expect } from '@playwright/test';
import { interstitialCutTo, revealFromInterstitial } from '../demos/clip-helpers';

test('cover dissolves', async ({ page }) => {
	await page.goto('http://localhost:5173/login');
	await interstitialCutTo(page, 'the other side', 'Who gets in is your decision', 'http://localhost:5173/login', {
		holdMs: 200
	});
	const opacity = async () =>
		page.evaluate(() => {
			const el = document.getElementById('revel-cut-cover');
			return el ? Number(getComputedStyle(el).opacity) : -1;
		});
	console.log('before reveal:', await opacity());
	const samples: number[] = [];
	const reveal = revealFromInterstitial(page, 800);
	for (let i = 0; i < 6; i++) {
		await page.waitForTimeout(120);
		samples.push(await opacity());
	}
	await reveal;
	console.log('samples during reveal:', samples.map((s) => s.toFixed(2)).join(' → '));
	const mid = samples.filter((s) => s > 0.05 && s < 0.95);
	console.log('intermediate opacity frames:', mid.length);
	expect(mid.length).toBeGreaterThan(1);
});
