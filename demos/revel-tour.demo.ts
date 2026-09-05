import { test, showOverlay, withOverlay, demoType } from '@argo-video/cli';
import type { Page } from '@playwright/test';

const MEMBER_EMAIL = 'charlie.member@example.com';
const MEMBER_PASSWORD = 'password123';
const EVENT_NAME = 'Classical Music Evening';
const EVENT_PATH = '/events/revel-events-collective/classical-music-evening';

/** Smooth incremental scroll over roughly `ms` milliseconds. */
async function slowScroll(page: Page, totalPx: number, ms: number): Promise<void> {
	const steps = Math.max(1, Math.floor(ms / 120));
	const perStep = Math.round(totalPx / steps);
	for (let i = 0; i < steps; i++) {
		await page.mouse.wheel(0, perStep);
		await page.waitForTimeout(120);
	}
}

/** Hide demo-environment chrome (banner + test-card hints) for a clean take. */
async function hideDemoChrome(page: Page): Promise<void> {
	await page.addStyleTag({
		content: `
			div[role="alert"]:has(a[href*="mailpit"]) { display: none !important; }
		`
	});
}

// The app ships a nonce-based CSP that blocks argo's GSAP overlay runtime
// (animated blocks like logo-outro). Recording-only bypass, never the app.
test.use({ bypassCSP: true });

test('revel-tour', async ({ page, narration }) => {
	test.setTimeout(300_000);

	// ---- Setup (not recorded): log in as a member, then land on the homepage.
	// The seeded backend runs in DEMO_MODE, so /login defaults to the
	// demo-account picker; reveal the real form first (no-op otherwise).
	await page.goto('/login');
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	const reveal = page.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3_000 }).catch(() => false)) {
		await reveal.click();
	}
	await page.getByLabel('Email address').fill(MEMBER_EMAIL);
	await page.getByLabel('Password', { exact: true }).fill(MEMBER_PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20_000 });

	// Self-healing retakes: release any leftover seat holds from a previous
	// run (a tap on a held seat releases it), still before recording starts.
	await page.goto(EVENT_PATH);
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20_000 });
	const cleanupPick = page.getByRole('button', { name: 'Pick seats…' }).first();
	if (await cleanupPick.isVisible({ timeout: 5_000 }).catch(() => false)) {
		await cleanupPick.click();
		const cleanupPicker = page.getByTestId('seat-picker-dialog');
		await cleanupPicker.waitFor({ state: 'visible', timeout: 10_000 });
		await cleanupPicker.getByText('STAGE').waitFor({ timeout: 15_000 });
		const held = cleanupPicker.getByRole('button', { name: /^Seat /, pressed: true });
		for (let i = 0; i < 5 && (await held.count()) > 0; i++) {
			await held.first().click();
			await page.waitForTimeout(1000);
		}
		await page.keyboard.press('Escape');
		await cleanupPicker.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
	}

	await page.goto('/');
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	// Client auth bootstrap must finish before any mutation (seat holds later);
	// the notifications bell doubles as the readiness signal.
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20_000 });
	await page.waitForLoadState('networkidle');
	await hideDemoChrome(page);
	await page.mouse.move(960, 400);

	await narration.startRecording(page);

	// ---- Scene 1: landing hero
	narration.mark('hero');
	await showOverlay(page, 'hero', narration.durationFor('hero'));
	await page.waitForTimeout(1500);
	await slowScroll(page, 900, Math.max(1000, narration.durationFor('hero')));

	// ---- Scene 2: event discovery + live search (SPA nav keeps injected CSS)
	await page.getByRole('link', { name: 'Browse Events' }).first().click();
	await page.waitForURL(/\/events(\?|$)/, { timeout: 15_000 });
	await page.waitForLoadState('networkidle');
	narration.mark('discover');
	await withOverlay(page, 'discover', async () => {
		await page.waitForTimeout(1200);
		const search = page.getByRole('searchbox', { name: 'Search events' });
		await search.click();
		await demoType(page, search, 'Classical', 90);
		const card = page.getByRole('link', { name: new RegExp(EVENT_NAME) }).first();
		await card.waitFor({ state: 'visible', timeout: 10_000 });
		await page.waitForTimeout(Math.max(1000, narration.durationFor('discover')));
		await card.hover();
		await card.click();
	});

	// ---- Scene 3: event detail page
	await page.waitForURL(/\/events\/.+/, { timeout: 15_000 });
	await page.waitForLoadState('networkidle');
	narration.mark('event');
	await withOverlay(page, 'event', async () => {
		await page.waitForTimeout(1500);
		await slowScroll(page, 900, Math.max(1000, narration.durationFor('event')));
	});

	// ---- Scene 4: interactive seat picker (every tap is a live server hold)
	const pickButton = page.getByRole('button', { name: 'Pick seats…' }).first();
	await pickButton.scrollIntoViewIfNeeded();
	await pickButton.hover();
	await pickButton.click();
	const picker = page.getByTestId('seat-picker-dialog');
	await picker.waitFor({ state: 'visible', timeout: 10_000 });
	await picker.getByText('STAGE').waitFor({ timeout: 15_000 });

	narration.mark('seats');
	await withOverlay(page, 'seats', async () => {
		await page.waitForTimeout(800);
		const freeSeats = picker.getByRole('button', {
			name: /^Seat /,
			pressed: false,
			disabled: false
		});
		for (let i = 0; i < 2; i++) {
			const available = await freeSeats.count();
			if (available === 0) break;
			const seat = freeSeats.nth(Math.min(4, available - 1));
			await seat.scrollIntoViewIfNeeded();
			await seat.hover();
			await page.waitForTimeout(500);
			await seat.click();
			await page
				.waitForFunction(
					() =>
						document.querySelectorAll(
							'[data-testid="seat-picker-dialog"] button[aria-pressed="true"]'
						).length > 0,
					undefined,
					{ timeout: 8_000 }
				)
				.catch(() => undefined);
			await page.waitForTimeout(1200);
		}
		await page.waitForTimeout(Math.max(0, narration.durationFor('seats')));
	});

	// ---- Scene 5: outro card
	narration.mark('outro');
	await showOverlay(page, 'outro', narration.durationFor('outro'));
	await page.waitForTimeout(500);
});
