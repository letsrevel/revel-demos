import { test, withOverlay } from '@argo-video/cli';
// @ts-expect-error plain JS shared with probes
import { createDressedOrg, createEvent, registerVerifiedUser, rsvpYes } from './arrange-lib.mjs';
import { gotoClean, uiLogin, waitClientAuth, glideScroll } from './clip-helpers';
import { showTitleCard, titleCardCutTo, closeEpisode } from './episode-helpers';
import type { Locator, Page } from '@playwright/test';

test.use({ bypassCSP: true });

// Episode 12 · Your account, your data. One regular user — Noor, who has said
// yes to a supper club dinner — walks her own account: name, pronouns and
// language on the profile; a peanut allergy entered once; a daily digest;
// two-factor sign-in (set up but deliberately not completed); and the export
// and delete buttons on the privacy page. No persona cut: every page after the
// first is reached through the avatar menu, so the montage stays in-app.
const CARD = { episode: 12, title: 'Your account, your data', pov: 'a regular user' };

const ADDRESS = 'Schwedenplatz 2, 1010 Vienna, Austria';

/** Sign in and wait for the bell — the sign the rotated refresh cookie is stored. */
async function loginSettled(p: Page, email: string, password: string): Promise<void> {
	await uiLogin(p, email, password);
	await waitClientAuth(p);
}

/** A locator's top edge in PAGE pixels (viewport y + scroll offset). */
async function pageTop(page: Page, target: Locator): Promise<number> {
	const box = await target.boundingBox();
	const scrollY = await page.evaluate(() => window.scrollY);
	return (box?.y ?? 0) + scrollY;
}

/** Glide the window to an absolute scroll position. */
async function glideTo(page: Page, targetY: number, ms: number): Promise<void> {
	const current = await page.evaluate(() => window.scrollY);
	const delta = Math.round(targetY - current);
	if (Math.abs(delta) < 4) return;
	await glideScroll(page, delta, ms);
}

/**
 * The in-app route between account pages: open the avatar menu, click the
 * item, wait for the client-side navigation to settle. No full load, so no
 * cover is needed and the demo chrome stays hidden.
 */
async function viaUserMenu(page: Page, label: string, urlRe: RegExp): Promise<void> {
	const trigger = page.getByRole('button', { name: 'User menu' }).filter({ visible: true }).first();
	await trigger.hover();
	await page.waitForTimeout(350);
	await trigger.click();
	const item = page.getByRole('menuitem', { name: label, exact: true });
	await item.waitFor({ timeout: 5_000 });
	await page.waitForTimeout(450);
	await item.hover();
	await page.waitForTimeout(350);
	await item.click();
	await page.waitForURL(urlRe, { timeout: 15_000 });
	await page.waitForLoadState('networkidle').catch(() => undefined);
	await waitClientAuth(page).catch(() => undefined);
}

test('ep-your-account', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a supper club, one dinner, and Noor, who is
	// coming — so the account being toured is a real person's, not an empty one.
	const org = await createDressedOrg({
		name: 'Donaukanal Supper Club',
		description:
			'A long table by the canal, once a month. Someone cooks, everyone brings something, nobody leaves hungry. Dietary needs are taken seriously — tell us once and we plan around them.',
		address: ADDRESS
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Long Table Dinner, September',
		description:
			'Thirty seats along one table under the plane trees. Mains are cooked on site; bring a salad, a bread or a dessert. We read every dietary note before we shop.',
		requires_ticket: false,
		max_attendees: 30,
		address: ADDRESS
	});
	const noor = await registerVerifiedUser('noor-haddad', 'Noor', 'Haddad', { emailLocal: 'noor.haddad' });
	await rsvpYes(event.id, noor.token);

	const profilePath = '/account/profile';

	// ---- Noor in, with the profile page primed on this very page (bundle
	// cache, client auth), so the cut off the title card lands on a painted
	// form. On a busy shared stack the bootstrap can miss once; off camera a
	// fresh sign-in is cheap.
	for (let attempt = 0; ; attempt++) {
		await loginSettled(page, noor.email, noor.password).catch(() => undefined);
		await gotoClean(page, profilePath);
		const ok = await waitClientAuth(page).then(() => true, () => false);
		if (ok) break;
		if (attempt >= 3) throw new Error('client auth never landed on the profile page');
		console.warn(`[ep-your-account] client auth missed on ${profilePath} — signing in again`);
		await page.waitForTimeout(8000 + attempt * 4000);
	}
	await page.locator('#preferred_name').waitFor({ timeout: 15_000 });

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene 1: profile — preferred name, pronouns, language, save.
	await titleCardCutTo(page, CARD, profilePath);
	await waitClientAuth(page).catch(() => undefined);
	const preferred = page.locator('#preferred_name');
	await preferred.waitFor({ timeout: 15_000 }).catch(() => undefined);
	await page.mouse.move(1500, 600);
	narration.mark('profile');
	await withOverlay(page, 'profile', async () => {
		// Frame the name fields, pronouns, language and the Save button together.
		await page.waitForTimeout(500);
		await glideTo(page, (await pageTop(page, preferred)) - 330, 1400);
		await preferred.hover();
		await preferred.click();
		await page.waitForTimeout(300);
		await preferred.pressSequentially('Noor', { delay: 110 });
		await page.waitForTimeout(500);
		const pronouns = page.locator('#pronouns-select');
		await pronouns.hover();
		await page.waitForTimeout(400);
		await pronouns.selectOption('she/her');
		await page.waitForTimeout(700);
		const language = page.locator('#language');
		await language.hover();
		await page.waitForTimeout(900);
		const save = page.getByRole('button', { name: 'Save Changes' }).first();
		await save.hover();
		await page.waitForTimeout(400);
		await save.click();
		await page.getByText('Profile updated successfully').waitFor({ timeout: 15_000 }).catch(() => undefined);
		await page.mouse.move(1500, 700, { steps: 10 });
		await page.waitForTimeout(Math.max(900, narration.durationFor('profile')));
	});

	// ---- Scene 2: dietary restriction — Peanuts, allergy — further down the page.
	narration.mark('dietary');
	await withOverlay(page, 'dietary', async () => {
		// Frame the whole dietary section from its title down, which keeps the
		// restrictions row mid-frame and the page footer out of the way.
		const sectionTitle = page.getByRole('heading', { name: 'Dietary Preferences & Restrictions' }).first();
		await glideTo(page, (await pageTop(page, sectionTitle)) - 100, 1800);
		await page.waitForTimeout(400);
		const add = page.getByRole('button', { name: 'Add Restriction', exact: true }).filter({ visible: true }).first();
		await add.hover();
		await page.waitForTimeout(450);
		await add.click();
		const dialog = page.getByRole('dialog').filter({ has: page.locator('#food-item-name') });
		await dialog.waitFor({ timeout: 10_000 });
		await page.waitForTimeout(500);
		const food = dialog.locator('#food-item-name');
		await food.click();
		await food.pressSequentially('Peanuts', { delay: 100 });
		await page.waitForTimeout(900);
		// The food-item search may or may not offer a match; take it if it does.
		const suggestion = dialog.locator('[role="listbox"] [role="option"]').first();
		if (await suggestion.isVisible().catch(() => false)) {
			await suggestion.hover();
			await page.waitForTimeout(250);
			await suggestion.click();
		}
		const severity = dialog.locator('#restriction-type');
		await severity.hover();
		await page.waitForTimeout(350);
		await severity.selectOption('allergy');
		await page.waitForTimeout(800);
		const confirm = dialog.getByRole('button', { name: 'Add Restriction', exact: true });
		await confirm.hover();
		await page.waitForTimeout(400);
		await confirm.click();
		await dialog.waitFor({ state: 'hidden', timeout: 15_000 });
		await page.getByText('Peanuts').filter({ visible: true }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
		await page.mouse.move(1500, 760, { steps: 10 });
		await page.waitForTimeout(Math.max(1200, narration.durationFor('dietary')));
	});

	// ---- Scene 3: settings — the daily digest.
	await viaUserMenu(page, 'Settings', /\/account\/settings/);
	const digestHeading = page.getByText('Digest Settings').first();
	await digestHeading.waitFor({ timeout: 15_000 }).catch(() => undefined);
	narration.mark('notifications');
	await withOverlay(page, 'notifications', async () => {
		await page.waitForTimeout(500);
		// Channels card above, digest card mid-frame, Save row still in frame
		// below it (the card grows by a time picker once Daily is chosen).
		await glideTo(page, (await pageTop(page, digestHeading)) - 330, 1600);
		await page.waitForTimeout(300);
		const daily = page.locator('#freq-daily');
		await daily.hover();
		await page.waitForTimeout(400);
		await daily.click();
		await page.waitForTimeout(600);
		// The API hands back "09:00:00" and the form's HH:MM check rejects it;
		// retyping the time clears that and reads as choosing the hour.
		const sendTime = page.locator('#digest-time');
		if (await sendTime.isVisible().catch(() => false)) {
			await sendTime.hover();
			await page.waitForTimeout(300);
			await sendTime.fill('09:00');
			await page.waitForTimeout(500);
		}
		const save = page.getByRole('button', { name: 'Save Changes' }).last();
		await save.hover();
		await page.waitForTimeout(400);
		await save.click();
		await page.getByText('Notification preferences updated successfully').waitFor({ timeout: 15_000 }).catch(() => undefined);
		await page.mouse.move(1500, 500, { steps: 10 });
		await page.waitForTimeout(Math.max(1200, narration.durationFor('notifications')));
	});

	// ---- Scene 4: security — start two-factor setup, QR and secret on screen.
	await viaUserMenu(page, 'Security', /\/account\/security/);
	const enable = page.getByRole('button', { name: 'Enable 2FA' });
	await enable.waitFor({ timeout: 15_000 }).catch(() => undefined);
	narration.mark('security');
	await withOverlay(page, 'security', async () => {
		await page.waitForTimeout(700);
		await enable.hover();
		await page.waitForTimeout(450);
		await enable.click();
		const qr = page.getByRole('img', { name: 'QR code for 2FA setup' });
		await qr.waitFor({ timeout: 20_000 }).catch(() => undefined);
		await page.waitForTimeout(1600);
		const cantScan = page.getByText("Can't scan? Enter manually");
		if (await cantScan.isVisible().catch(() => false)) {
			await cantScan.hover();
			await page.waitForTimeout(300);
			await cantScan.click();
		}
		// Park the cursor beside the card, off the QR and the secret.
		await page.mouse.move(1560, 520, { steps: 12 });
		await page.waitForTimeout(Math.max(1500, narration.durationFor('security')));
	});

	// ---- Scene 5: privacy — export (hover), then the danger zone (hover).
	await viaUserMenu(page, 'Privacy & Data', /\/account\/privacy/);
	const exportBtn = page.getByRole('button', { name: 'Request Data Export' });
	await exportBtn.waitFor({ timeout: 15_000 }).catch(() => undefined);
	narration.mark('privacy');
	await withOverlay(page, 'privacy', async () => {
		await page.waitForTimeout(600);
		// Hover only: the click goes through the frontend's server, whose IP
		// shares the API throttle with everyone else — a red line on camera
		// is not worth the beat.
		await exportBtn.hover();
		await page.waitForTimeout(2400);
		const deleteBtn = page.getByRole('button', { name: 'Delete My Account' });
		// The Danger Zone card is the last thing on the page, so a true centre
		// would drag the footer and its cookie notice into the lower half of the
		// frame. Aim for the centre, but never scroll past the point where the
		// footer's top edge meets the bottom of the viewport — the card then sits
		// in the lower-middle with the export card still visible above it.
		const card = page.locator('section').filter({ has: deleteBtn }).first();
		const cardBox = await card.boundingBox();
		const cardTop = await pageTop(page, card);
		const centred = cardTop + (cardBox?.height ?? 360) / 2 - 540;
		const footerTop = await pageTop(page, page.locator('footer').first()).catch(() => Number.POSITIVE_INFINITY);
		const viewportH = page.viewportSize()?.height ?? 1080;
		await glideTo(page, Math.max(0, Math.min(centred, footerTop - viewportH)), 2000);
		await page.waitForTimeout(300);
		await deleteBtn.hover();
		await page.waitForTimeout(Math.max(1500, narration.durationFor('privacy')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
