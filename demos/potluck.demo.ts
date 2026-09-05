import { test, showOverlay, withOverlay, demoType } from '@argo-video/cli';
import type { Page } from '@playwright/test';
// @ts-expect-error plain JS shared with probes/potluck.mjs
import { arrange, GUEST } from './arrange-potluck.mjs';

// The app ships a nonce-based CSP that blocks argo's GSAP overlay runtime.
// Recording-only bypass, never the app.
test.use({ bypassCSP: true });

const POTLUCK_HEADER =
	'section[aria-labelledby="potluck-heading"] button[aria-controls="potluck-content"]';

async function slowScroll(page: Page, totalPx: number, ms: number): Promise<void> {
	const steps = Math.max(1, Math.floor(ms / 120));
	const perStep = Math.round(totalPx / steps);
	for (let i = 0; i < steps; i++) {
		await page.mouse.wheel(0, perStep);
		await page.waitForTimeout(120);
	}
}

async function hideDemoChrome(page: Page): Promise<void> {
	await page.addStyleTag({
		content: `div[role="alert"]:has(a[href*="mailpit"]) { display: none !important; }`
	});
}

async function waitHydrated(page: Page): Promise<void> {
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
}

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

/** Swap the context's session on an unrecorded page while the recorded one shows an interstitial. */
async function switchUser(page: Page, email: string, password: string): Promise<void> {
	const side = await page.context().newPage();
	await side.goto('/logout');
	await side.waitForURL(/logged_out/, { timeout: 15_000 }).catch(() => undefined);
	await uiLogin(side, email, password);
	await side.close();
}

/** Soft lavender-paper interstitial (brand surface, not a saturated wall). */
async function showInterstitial(page: Page, kicker: string, title: string): Promise<void> {
	await page.goto('about:blank');
	await page.evaluate(
		([k, t]) => {
			document.body.innerHTML = `
				<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.1rem;background:linear-gradient(160deg,#F4EEFB 0%,#E9E0F7 55%,#DDE4FF 100%);font-family:-apple-system,'Nata Sans',sans-serif;">
					<div style="color:#8C3CDD;font-size:1.05rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">${k}</div>
					<div style="color:#0D1E1C;font-size:3.2rem;font-weight:900;line-height:1.12;text-align:center;max-width:60rem;">${t}</div>
				</div>`;
			document.body.style.margin = '0';
		},
		[kicker, title]
	);
}

async function expandPotluck(page: Page): Promise<void> {
	const header = page.locator(POTLUCK_HEADER);
	await header.waitFor({ timeout: 15_000 });
	if ((await header.getAttribute('aria-expanded')) !== 'true') {
		await header.scrollIntoViewIfNeeded();
		await header.hover();
		await page.waitForTimeout(400);
		await header.click();
	}
	await page.locator('#potluck-content').waitFor({ timeout: 10_000 });
}

test('potluck', async ({ page, narration }) => {
	test.setTimeout(300_000);
	page.on('dialog', (d) => d.dismiss());

	// ---- Setup (not recorded)
	const { eventPath, owner } = await arrange();
	await uiLogin(page, GUEST.email, GUEST.password);
	await page.goto(eventPath);
	await waitHydrated(page);
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20_000 });
	await page.waitForLoadState('networkidle');
	await hideDemoChrome(page);
	await page.mouse.move(960, 400);

	await narration.startRecording(page);

	// ---- Scene 1: arrive — the list lives on the event page
	narration.mark('arrive');
	await withOverlay(page, 'arrive', async () => {
		await page.waitForTimeout(1600);
		const header = page.locator(POTLUCK_HEADER);
		await header.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
		await page.waitForTimeout(1400);
		await header.hover();
		await page.waitForTimeout(Math.max(1200, narration.durationFor('arrive')));
	});

	// ---- Scene 2: RSVP yes
	narration.mark('rsvp');
	await withOverlay(page, 'rsvp', async () => {
		const yes = page
			.getByRole('button', { name: "RSVP Yes - I'm attending" })
			.filter({ visible: true })
			.first();
		await yes.scrollIntoViewIfNeeded();
		await yes.hover();
		await page.waitForTimeout(900);
		await yes.click();
		await page.getByText("You're attending").filter({ visible: true }).first().waitFor({ timeout: 15_000 });
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(700);
		await expandPotluck(page);
		await page.waitForTimeout(Math.max(1200, narration.durationFor('rsvp')));
	});

	// ---- Scene 3: claim the goulash
	narration.mark('claim');
	await withOverlay(page, 'claim', async () => {
		const claim = page.getByRole('button', { name: 'Claim Big pot of goulash' });
		await claim.scrollIntoViewIfNeeded();
		await page.waitForTimeout(1200);
		await claim.hover();
		await page.waitForTimeout(700);
		await claim.click();
		await page
			.getByRole('button', { name: 'Unclaim Big pot of goulash' })
			.waitFor({ timeout: 15_000 });
		await page.waitForTimeout(Math.max(1500, narration.durationFor('claim')));
	});

	// ---- Scene 4: add your own item
	narration.mark('add');
	await withOverlay(page, 'add', async () => {
		const add = page.getByRole('button', { name: "Add item you'll bring" });
		await add.scrollIntoViewIfNeeded();
		await add.hover();
		await page.waitForTimeout(500);
		await add.click();
		const name = page.locator('#edit-item-name');
		await name.waitFor({ timeout: 10_000 });
		await page.waitForTimeout(400);
		await name.click();
		await demoType(page, name, "Grandma's apple strudel", 45);
		if (!(await name.inputValue()).includes('strudel')) {
			await name.fill("Grandma's apple strudel");
		}
		await page.locator('#edit-item-type').selectOption('dessert');
		await page.waitForTimeout(400);
		const qty = page.locator('#edit-quantity');
		await qty.click();
		await demoType(page, qty, '1 tray', 60);
		await page.waitForTimeout(600);
		const submit = page.getByRole('dialog').locator('button[type="submit"]');
		await submit.hover();
		await page.waitForTimeout(400);
		await submit.click();
		await page
			.getByRole('button', { name: "Unclaim Grandma's apple strudel" })
			.waitFor({ timeout: 15_000 });
		await page.locator(POTLUCK_HEADER).scrollIntoViewIfNeeded();
		await page.waitForTimeout(Math.max(1500, narration.durationFor('add')));
	});

	// ---- Scene 5: the host's view (content change BEFORE the mark, per argo's transition tip)
	await showInterstitial(page, 'Meanwhile', 'For the host…');
	await page.waitForTimeout(3500);
	await switchUser(page, owner.email, owner.password);
	await page.goto(eventPath);
	await waitHydrated(page);
	await page.waitForLoadState('networkidle');
	await hideDemoChrome(page);
	await expandPotluck(page);
	const editGoulash = page.getByRole('button', { name: 'Edit Big pot of goulash' });
	await editGoulash.waitFor({ timeout: 15_000 });
	await page.locator(POTLUCK_HEADER).evaluate((el) => {
		el.scrollIntoView({ block: 'start' });
		window.scrollBy(0, -140); // keep the tally line clear of the sticky navbar
	});
	await page.waitForTimeout(300);
	narration.mark('host');
	await withOverlay(page, 'host', async () => {
		await page.waitForTimeout(2500);
		await editGoulash.hover();
		await page.waitForTimeout(Math.max(1500, narration.durationFor('host')));
	});

	// ---- Scene 6: the host's aggregated dietary summary (card sits right above the potluck)
	const dietaryToggle = page
		.locator('button[aria-expanded]')
		.filter({ hasText: 'Dietary Information' })
		.first();
	await dietaryToggle.evaluate((el) => {
		el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		window.scrollBy({ top: -140, behavior: 'smooth' });
	});
	await page.waitForTimeout(900);
	narration.mark('dietary');
	await withOverlay(page, 'dietary', async () => {
		await page.waitForTimeout(600);
		await dietaryToggle.click();
		// Park the cursor off the header at once: its hover state is the crimson accent.
		await page.mouse.move(960, 700);
		const peanuts = page.getByText('Peanuts').first();
		await peanuts.waitFor({ timeout: 10_000 });
		await page.waitForTimeout(1200);
		await peanuts.hover();
		await page.waitForTimeout(Math.max(1500, narration.durationFor('dietary')));
	});

	// ---- Scene 7: outro
	narration.mark('outro');
	await showOverlay(page, 'outro', narration.durationFor('outro'));
	await page.waitForTimeout(500);
});
