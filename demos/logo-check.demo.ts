import { test, showOverlay } from '@argo-video/cli';
import type { Page } from '@playwright/test';

/** Smooth incremental scroll over roughly `ms` milliseconds. */
async function slowScroll(page: Page, totalPx: number, ms: number): Promise<void> {
	const steps = Math.max(1, Math.floor(ms / 120));
	const perStep = Math.round(totalPx / steps);
	for (let i = 0; i < steps; i++) {
		await page.mouse.wheel(0, perStep);
		await page.waitForTimeout(120);
	}
}

/** Hide demo-environment chrome (banner) — re-apply after every full load. */
async function hideDemoChrome(page: Page): Promise<void> {
	await page.addStyleTag({
		content: `div[role="alert"]:has(a[href*="mailpit"]) { display: none !important; }`
	});
}

/**
 * Soft brand surface for the end card (the "softer" rule): whisper lavender
 * paper drifting into pale periwinkle — a gentle gradient, not a loud
 * full-saturation wall. The logo-outro overlay card lands on top of this.
 */
async function showEndCardSurface(page: Page): Promise<void> {
	await page.goto('about:blank');
	await page.evaluate(() => {
		document.body.style.margin = '0';
		document.body.innerHTML = `
			<div style="position:fixed;inset:0;background:linear-gradient(165deg,hsl(268 60% 96%) 0%,hsl(268 55% 94%) 55%,hsl(226 100% 93%) 100%);"></div>`;
	});
}

// The app ships a nonce-based CSP that blocks argo's GSAP overlay runtime
// (animated blocks like logo-outro). Recording-only bypass, never the app.
test.use({ bypassCSP: true });

test('logo-check', async ({ page, narration }) => {
	test.setTimeout(300_000);

	// ---- Setup (not recorded): anonymous visitor on the landing page.
	await page.goto('/');
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await page.waitForLoadState('networkidle');
	await hideDemoChrome(page);
	await page.mouse.move(960, 400);

	await narration.startRecording(page);

	// ---- Scene 1: landing hero, slow scroll (no overlay — clean take)
	narration.mark('hero');
	await page.waitForTimeout(1500);
	await slowScroll(page, 900, Math.max(2000, narration.durationFor('hero')));
	await page.waitForTimeout(800);

	// ---- Scene 2: outro end card — real gradient R mark on soft lavender
	await showEndCardSurface(page);
	narration.mark('outro');
	await showOverlay(page, 'outro', narration.durationFor('outro'));
	await page.waitForTimeout(500);
});
