// Visual check for the brand end card. Not a demo — run with:
//   npx playwright test -c probes/endcard.config.ts
import { test } from '@playwright/test';
import { showEndCard } from '../demos/clip-helpers';

test('end card', async ({ page }) => {
	await showEndCard(page);
	await page.waitForTimeout(2500);
	await page.screenshot({ path: process.env.SHOT_PATH || 'endcard.png' });
});
