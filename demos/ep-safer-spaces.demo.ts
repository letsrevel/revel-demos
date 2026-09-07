import { test, withOverlay } from '@argo-video/cli';
import type { Locator, Page } from '@playwright/test';
// @ts-expect-error plain JS shared with probes
import { api, createDressedOrg, createEvent, registerVerifiedUser } from './arrange-lib.mjs';
import { uiLogin, waitClientAuth } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 8 · Safer spaces. The organizer of a social-dance collective adds a
// name-only blacklist entry on camera; then a fresh user whose name matches
// opens the night, sees the verification message, and asks to be checked; and
// the organizer sees that request, with the message, in the queue. Nothing is
// approved or rejected on camera — the episode ends on the decision, not on
// the verdict.
const CARD = { episode: 8, title: 'Safer spaces', pov: 'the organizer, then someone on the list' };

const ADDRESS = 'Yppenplatz 4, 1160 Vienna, Austria';
const REASON = 'Repeated boundary issues at two events — not welcome back.';
const MESSAGE = "I think this is a mix-up — I've never been to one of your events; happy to talk.";

/** Bounded wait that never fails the take: a screen that never arrives is worse than a flash. */
async function settle(locator: Locator, ms: number): Promise<void> {
	await locator.waitFor({ timeout: ms }).catch(() => undefined);
}

/**
 * Org names are unique, and `createDressedOrg` resolves a clash by appending
 * "Studio" / "II" / "III" — which would put "Social Dance IV" on camera by the
 * fourth render. Pick a district prefix that is still free instead.
 */
async function freeOrgName(): Promise<string> {
	// The search endpoint ranks every "… Social Dance" org together and pages
	// at five, so an exact-name check can miss the one that matters. The public
	// org page by slug is a plain 404 when the name is free.
	const districts = ['Ottakring', 'Hernals', 'Neubau', 'Josefstadt', 'Wieden', 'Margareten', 'Mariahilf', 'Alsergrund', 'Landstraße', 'Leopoldstadt', 'Favoriten', 'Simmering'];
	for (const d of districts) {
		const name = `${d} Social Dance`;
		const slug = name.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[^a-z0-9]+/g, '-');
		const taken = await api(`/api/organizations/${slug}`).then(() => true, () => false);
		if (!taken) return name;
	}
	return 'Open Floor Social Dance';
}

/**
 * Like clip-helpers' `switchUser`, but waits for the side page's own client
 * auth to land before closing it. Refresh tokens rotate on every refresh, and
 * closing the side page while its bootstrap refresh is still in flight drops
 * the rotated cookie — the recorded page then presents a blacklisted token on
 * its next load and paints the whole admin page logged out. Seen in the probe.
 */
async function switchUserSettled(page: Page, email: string, password: string): Promise<void> {
	const side = await page.context().newPage();
	await side.goto('/logout');
	await side.waitForURL(/logged_out/, { timeout: 15_000 }).catch(() => undefined);
	await uiLogin(side, email, password);
	await side.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 30_000 }).catch(() => undefined);
	await side.close();
}

test('ep-safer-spaces', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a social-dance collective with a stated code
	// of conduct, one open R S V P night, and Jordan — registered BEFORE the
	// entry exists (the entry is made on camera) and not a member, so the
	// name check applies.
	const org = await createDressedOrg({
		name: await freeOrgName(),
		description:
			'A monthly social dance in a rented hall in Ottakring: an hour of beginner steps, then open floor until late. We keep a short code of conduct — ask before you touch, a no is a no, and any host will help if something feels off. Everyone dances with everyone.',
		address: ADDRESS
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Saturday Social: Open Floor',
		description:
			'Beginner steps from eight, open floor from nine, tea and biscuits at the back. Free — just R S V P so we know how many people to expect. Come alone or bring a friend; you will be dancing with everyone.',
		requires_ticket: false,
		max_attendees: 60,
		address: ADDRESS
	});
	const jordan = await registerVerifiedUser('jordan', 'Jordan', 'Vale', { emailLocal: 'jordan.vale' });

	const blacklistPath = `/org/${org.slug}/admin/blacklist`;

	// ---- Setup (not recorded): owner session, and a primed bundle cache for
	// the first app page so its client-only list hydrates sooner under the cover.
	await uiLogin(page, org.owner.email, org.owner.password);
	await waitClientAuth(page);
	const warm = await page.context().newPage();
	await warm.goto(blacklistPath).catch(() => undefined);
	await warm.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 30_000 }).catch(() => undefined);
	await warm.waitForLoadState('networkidle').catch(() => undefined);
	await warm.close();

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene 1: the blacklist page, and a name-only entry made on camera.
	await titleCardCutTo(page, CARD, blacklistPath);
	await settle(page.getByRole('button', { name: 'Open notifications' }), 10_000);
	await settle(page.getByText('No blacklist entries').filter({ visible: true }).first(), 8_000);
	await page.mouse.move(960, 900);
	narration.mark('entry');
	await withOverlay(page, 'entry', async () => {
		// Paced against a ~16 s line: the form is open while the narration
		// lists what an entry can be, the note is typed while it says "a short
		// note on why", and the card lands just before the line ends.
		await page.waitForTimeout(1500);
		const add = page.getByRole('button', { name: 'Add to Blacklist' }).filter({ visible: true }).first();
		await add.hover();
		await page.waitForTimeout(400);
		await add.click();
		const dialog = page.getByRole('dialog');
		await dialog.getByText('Name Information').waitFor({ timeout: 10_000 });
		await page.waitForTimeout(600);
		// The line first names the HARD identifiers (email, Telegram) — rest the
		// cursor on each of those fields while it does — and only then the soft
		// ones, which is when the names get typed.
		for (const hard of ['#email', '#telegram']) {
			const field = dialog.locator(hard);
			if (await field.count()) {
				await field.hover();
				await page.waitForTimeout(1900);
			}
		}
		const first = dialog.locator('#first-name');
		await first.click();
		await first.pressSequentially('Jordan', { delay: 120 });
		await page.waitForTimeout(350);
		const last = dialog.locator('#last-name');
		await last.click();
		await last.pressSequentially('Vale', { delay: 130 });
		await page.waitForTimeout(1400);
		const reason = dialog.locator('#reason');
		await reason.click();
		await reason.pressSequentially(REASON, { delay: 70 });
		await page.waitForTimeout(700);
		const submit = dialog.getByRole('button', { name: 'Add to Blacklist' });
		await submit.hover();
		await page.waitForTimeout(400);
		await submit.click();
		await settle(page.getByRole('heading', { name: 'Jordan Vale' }).filter({ visible: true }).first(), 15_000);
		await page.mouse.move(1500, 900);
		await page.waitForTimeout(Math.max(1500, narration.durationFor('entry')));
	});

	// ---- Cut: Jordan, on the event page.
	await episodeCut(page, 'Meanwhile', 'Someone whose name matched', event.path, {
		during: () => switchUserSettled(page, jordan.email, jordan.password)
	});
	await settle(page.getByRole('button', { name: 'Open notifications' }), 8_000);
	const notice = page.getByText('Additional verification required').filter({ visible: true }).first();
	await settle(notice, 10_000);
	await page.mouse.move(960, 600);
	narration.mark('blocked');
	await withOverlay(page, 'blocked', async () => {
		await page.waitForTimeout(1400);
		await notice.hover().catch(() => undefined);
		// Point at it, then get out of the way: a cursor parked on the line
		// being narrated hides the very words the narration is about.
		await page.waitForTimeout(1300);
		await page.mouse.move(1880, 760);
		await page.waitForTimeout(Math.max(0, narration.durationFor('blocked')));
	});

	// ---- Scene: the verification request, with a message.
	narration.mark('request');
	await withOverlay(page, 'request', async () => {
		const ask = page.getByRole('button', { name: 'Request Verification' }).filter({ visible: true }).first();
		await ask.hover();
		await page.waitForTimeout(500);
		await ask.click();
		const dialog = page.getByRole('dialog');
		await dialog.locator('#whitelist-message').waitFor({ timeout: 10_000 });
		await page.waitForTimeout(600);
		const message = dialog.locator('#whitelist-message');
		await message.click();
		await message.pressSequentially(MESSAGE, { delay: 38 });
		await page.waitForTimeout(500);
		const send = dialog.getByRole('button', { name: 'Submit Request' });
		await send.hover();
		await page.waitForTimeout(350);
		await send.click();
		await settle(dialog.getByText('Verification Request Submitted'), 15_000);
		// The dialog closes itself two seconds later and the sidebar refreshes.
		const pending = page.getByText('pending approval').filter({ visible: true }).first();
		await settle(pending, 10_000);
		await pending.hover().catch(() => undefined);
		await page.waitForTimeout(900);
		await page.mouse.move(1880, 760);
		await page.waitForTimeout(Math.max(1200, narration.durationFor('request')));
	});

	// ---- Cut: back to the organizer, and the queue.
	await episodeCut(page, 'Back at the collective', 'The organizer’s queue', blacklistPath, {
		during: () => switchUserSettled(page, org.owner.email, org.owner.password)
	});
	await settle(page.getByRole('button', { name: 'Open notifications' }), 10_000);
	await settle(page.getByRole('heading', { name: 'Jordan Vale' }).filter({ visible: true }).first(), 10_000);
	await page.mouse.move(960, 900);
	narration.mark('queue');
	await withOverlay(page, 'queue', async () => {
		await page.waitForTimeout(1200);
		const tab = page.getByRole('tab', { name: /Verification Requests/ }).first();
		await tab.hover();
		await page.waitForTimeout(500);
		await tab.click();
		const fromUser = page.getByText('Message from user:').filter({ visible: true }).first();
		await settle(fromUser, 10_000);
		await page.waitForTimeout(600);
		await page.getByText('Matches 1 blacklist entry').filter({ visible: true }).first().hover().catch(() => undefined);
		await page.waitForTimeout(1500);
		await fromUser.hover().catch(() => undefined);
		await page.waitForTimeout(1300);
		await page.mouse.move(1300, 1000);
		await page.waitForTimeout(Math.max(0, narration.durationFor('queue')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
