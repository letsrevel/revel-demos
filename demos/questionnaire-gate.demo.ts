import { test, showOverlay, withOverlay, demoType } from '@argo-video/cli';
import type { Page } from '@playwright/test';
// @ts-expect-error plain JS shared with probes/questionnaire-gate.mjs
import { arrange } from './arrange-qgate.mjs';

const GUEST_EMAIL = 'hannah.attendee@example.com';
const GUEST_PASSWORD = 'password123';
const ANSWER =
	"Complete beginner — I've been curious about shibari for a long time and a friend recommended your space. I care about learning safely and can't wait to start.";

// The app ships a nonce-based CSP that blocks argo's GSAP overlay runtime.
// Recording-only bypass, never the app.
test.use({ bypassCSP: true });

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

async function waitHydrated(page: Page): Promise<void> {
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
}

/** UI login handling the DEMO_MODE "Show login form" toggle. */
async function uiLogin(page: Page, email: string, password: string): Promise<void> {
	await page.goto('/login');
	await waitHydrated(page);
	const reveal = page.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3_000 }).catch(() => false)) {
		await reveal.click();
	}
	await page.getByLabel('Email address').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20_000 });
}

/**
 * Swap the CONTEXT's session to another user via a second, unrecorded page
 * (cookies are per-context; the recorded page picks the new session up on its
 * next full navigation). The recorded page should be showing an interstitial.
 */
async function switchUser(page: Page, email: string, password: string): Promise<void> {
	const side = await page.context().newPage();
	await side.goto('/logout');
	await side.waitForURL(/logged_out/, { timeout: 15_000 }).catch(() => undefined);
	await uiLogin(side, email, password);
	await side.close();
}

/** Full-screen branded interstitial on the recorded page (about:blank). */
async function showInterstitial(page: Page, kicker: string, title: string): Promise<void> {
	await page.goto('about:blank');
	await page.evaluate(
		([k, t]) => {
			document.body.innerHTML = `
				<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;background:linear-gradient(160deg,#8C3CDD 0%,#E6332A 100%);font-family:-apple-system,'Nata Sans',sans-serif;">
					<div style="color:#fff;opacity:.85;font-size:1.1rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">${k}</div>
					<div style="color:#fff;font-size:3.2rem;font-weight:900;line-height:1.12;text-align:center;max-width:60rem;">${t}</div>
				</div>`;
			document.body.style.margin = '0';
		},
		[kicker, title]
	);
}

test('questionnaire-gate', async ({ page, narration }) => {
	test.setTimeout(300_000);

	// ---- Setup (not recorded): arrange backend state, log in as the guest.
	const { eventPath, questionnaireId, orgSlug, owner } = await arrange();
	const submissionsPath = `/org/${orgSlug}/admin/questionnaires/${questionnaireId}/submissions`;

	await uiLogin(page, GUEST_EMAIL, GUEST_PASSWORD);
	await page.goto(eventPath);
	await waitHydrated(page);
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20_000 });
	await page.waitForLoadState('networkidle');
	await hideDemoChrome(page);
	await page.mouse.move(960, 400);

	await narration.startRecording(page);

	// ---- Scene 1: the gate
	narration.mark('gate');
	await showOverlay(page, 'gate', narration.durationFor('gate'));
	await page.waitForTimeout(1500);
	await slowScroll(page, 500, 2500);
	const cta = page
		.getByRole('button', { name: 'Complete Questionnaire' })
		.filter({ visible: true })
		.first();
	await cta.scrollIntoViewIfNeeded();
	await cta.hover();
	await page.waitForTimeout(Math.max(500, narration.durationFor('gate')));
	await cta.click();
	await page.waitForURL(/\/questionnaire\//, { timeout: 15_000 });
	await page.waitForLoadState('networkidle');
	await hideDemoChrome(page);

	// ---- Scene 2: fill & submit
	narration.mark('apply');
	await withOverlay(page, 'apply', async () => {
		await page.waitForTimeout(1000);
		const answerBox = page.getByRole('textbox').first();
		await answerBox.click();
		await demoType(page, answerBox, ANSWER, 30);
		// Guard against hydration-window drops (an empty submission burns the attempt).
		if (!(await answerBox.inputValue()).includes('beginner')) {
			await answerBox.fill(ANSWER);
		}
		await page.waitForTimeout(800);
		const submit = page.getByRole('button', { name: 'Submit Questionnaire' });
		await submit.hover();
		await page.waitForTimeout(400);
		await submit.click();
		await page.waitForURL(new RegExp(eventPath.split('/').pop() as string), { timeout: 15_000 });
	});
	await hideDemoChrome(page);

	// ---- Scene 3: pending review
	narration.mark('pending');
	await showOverlay(page, 'pending', narration.durationFor('pending'));
	await page
		.getByText(/being reviewed|under review/i)
		.first()
		.waitFor({ timeout: 10_000 })
		.catch(() => undefined);
	await page.waitForTimeout(Math.max(1500, narration.durationFor('pending')));

	// ---- Scene 4: cut to the organizer studio
	await showInterstitial(page, 'Meanwhile', 'In the organizer studio…');
	narration.mark('organizer');
	await page.waitForTimeout(2200);
	await switchUser(page, owner.email, owner.password);
	await page.goto(submissionsPath);
	await waitHydrated(page);
	await page.waitForLoadState('networkidle');
	await hideDemoChrome(page);
	await showOverlay(page, 'organizer', narration.durationFor('organizer'));
	const row = page
		.locator('tbody tr, div.bg-card')
		.filter({ hasText: 'Hannah' })
		.filter({ visible: true })
		.first();
	await row.waitFor({ timeout: 15_000 });
	await page.waitForTimeout(Math.max(1000, narration.durationFor('organizer')));

	// ---- Scene 5: review & approve
	await row.getByRole('link', { name: 'Review' }).click();
	await page.getByRole('heading', { name: 'Review Submission' }).waitFor({ timeout: 15_000 });
	await hideDemoChrome(page);
	narration.mark('approve');
	await withOverlay(page, 'approve', async () => {
		await page.waitForTimeout(1200);
		await slowScroll(page, 400, 2000);
		const approve = page.getByRole('button', { name: 'Approve' });
		await approve.scrollIntoViewIfNeeded();
		await approve.hover();
		await page.waitForTimeout(600);
		await approve.click();
		await page
			.getByRole('button', { name: /Approve/ })
			.getByText('Current')
			.waitFor({ timeout: 15_000 });
		await page.waitForTimeout(Math.max(800, narration.durationFor('approve')));
	});

	// ---- Scene 6: back to the guest — unlocked
	await showInterstitial(page, 'Back at the guest’s view', 'Approved.');
	await switchUser(page, GUEST_EMAIL, GUEST_PASSWORD);
	await page.goto(eventPath);
	await waitHydrated(page);
	await page.waitForLoadState('networkidle');
	await hideDemoChrome(page);
	narration.mark('unlocked');
	await showOverlay(page, 'unlocked', narration.durationFor('unlocked'));
	const getTickets = page
		.getByRole('button', { name: 'Get Tickets', exact: true })
		.filter({ visible: true })
		.first();
	await getTickets.waitFor({ timeout: 15_000 });
	await page.waitForTimeout(1200);
	await getTickets.scrollIntoViewIfNeeded();
	await getTickets.hover();
	await page.waitForTimeout(600);
	await getTickets.click();
	await page.waitForTimeout(Math.max(1000, narration.durationFor('unlocked')));

	// ---- Scene 7: outro
	narration.mark('outro');
	await showOverlay(page, 'outro', narration.durationFor('outro'));
	await page.waitForTimeout(500);
});
