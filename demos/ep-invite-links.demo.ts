import { test, withOverlay } from '@argo-video/cli';
import type { Locator } from '@playwright/test';
// @ts-expect-error plain JS shared with probes
import { api, createDressedOrg, createEvent, createEventToken, registerVerifiedUser } from './arrange-lib.mjs';
import { uiLogin, waitClientAuth, switchUser } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 4 · Invite links. An invitation-only night: the organizer makes a
// shareable link on camera, then a friend who was NOT invited opens it, sees
// what it grants, claims it, and R S V Ps.
const CARD = { episode: 4, title: 'Invite links', pov: 'the organizer, then an invited guest' };

const ADDRESS = 'Gumpendorfer Straße 63, 1060 Vienna, Austria';
const NEW_LINK = 'Friends of the band';

/** Bounded wait that never fails the take: a screen that never arrives is worse than a flash. */
async function settle(locator: Locator, ms: number): Promise<void> {
	await locator.waitFor({ timeout: ms }).catch(() => undefined);
}

test('ep-invite-links', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a small listening room, its invitation-only
	// night, one link that already exists (so the Links tab is a list, not an
	// empty state), and a fresh guest who has not been invited.
	const org = await createDressedOrg({
		name: 'Nachtschicht Listening Room',
		description:
			'A listening room above a shuttered print shop in Mariahilf. Forty chairs, one very good pair of speakers, and whole albums played front to back. We keep it small on purpose.',
		address: ADDRESS
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Late Session: Tape Loops & Tea',
		description:
			'An invitation-only late session: an hour of tape loops from two friends of the house, then tea and talk until we lock up. Thirty seats, no phones on the floor, bring someone who listens.',
		event_type: 'private',
		visibility: 'public',
		requires_ticket: false,
		max_attendees: 30,
		address: ADDRESS
	});
	await createEventToken(event.id, org.owner.token, {
		name: 'Regulars (WhatsApp group)',
		max_uses: 25,
		duration: 30 * 24 * 60
	});
	const guest = await registerVerifiedUser('invitee', 'Mira', 'Haddad', { emailLocal: 'mira.haddad' });

	const linksPath = `/org/${org.slug}/admin/events/${event.id}/invitations?tab=links`;

	// ---- Setup (not recorded): owner session, and a primed bundle cache for
	// the first app page so its client-only tab hydrates sooner under the cover.
	await uiLogin(page, org.owner.email, org.owner.password);
	await waitClientAuth(page);
	const warm = await page.context().newPage();
	await warm.goto(linksPath).catch(() => undefined);
	await warm.waitForLoadState('networkidle').catch(() => undefined);
	await warm.close();

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene 1: the Links tab, and a new link made on camera.
	await titleCardCutTo(page, CARD, linksPath);
	await settle(page.getByRole('heading', { name: 'Regulars (WhatsApp group)' }).filter({ visible: true }).first(), 12_000);
	await page.mouse.move(960, 900);
	narration.mark('token');
	await withOverlay(page, 'token', async () => {
		// Paced against a ~14 s line: the form should still be on screen when
		// the narration reaches the waivers, and the new card should land just
		// before the line ends — not seven seconds early.
		await page.waitForTimeout(1200);
		const create = page.getByRole('button', { name: 'Create Link' }).filter({ visible: true }).first();
		await create.hover();
		await page.waitForTimeout(400);
		await create.click();
		const dialog = page.getByRole('dialog');
		await dialog.getByText('Create Invitation Link').waitFor({ timeout: 10_000 });
		await page.waitForTimeout(700);
		const name = dialog.locator('#link-name');
		await name.click();
		await name.pressSequentially(NEW_LINK, { delay: 70 });
		await page.waitForTimeout(700);
		const maxUses = dialog.locator('#max-uses');
		await maxUses.click();
		await maxUses.fill('');
		await maxUses.pressSequentially('10', { delay: 180 });
		await page.waitForTimeout(900);
		// The waivers live behind "Advanced Invitation Options" — open them so
		// the line about waiving a questionnaire or a capacity limit has a picture.
		const advanced = dialog.getByRole('button', { name: 'Advanced Invitation Options' });
		if (await advanced.count()) {
			await advanced.hover();
			await page.waitForTimeout(300);
			await advanced.click();
			const cap = dialog.getByText('Override attendee limit');
			await settle(cap, 4_000);
			await page.waitForTimeout(900);
			await dialog.getByText('Waive questionnaire requirement').hover().catch(() => undefined);
			await page.waitForTimeout(1300);
			await cap.hover().catch(() => undefined);
			await page.waitForTimeout(1600);
		}
		const submit = dialog.getByRole('button', { name: 'Create Link' });
		await submit.hover();
		await page.waitForTimeout(400);
		await submit.click();
		await settle(page.getByRole('heading', { name: NEW_LINK }).filter({ visible: true }).first(), 15_000);
		await page.mouse.move(1500, 900);
		await page.waitForTimeout(Math.max(1500, narration.durationFor('token')));
	});

	// ---- Scene 2: the link itself, ready to send.
	narration.mark('link');
	await withOverlay(page, 'link', async () => {
		const card = page
			.locator('div.rounded-lg', { has: page.getByRole('heading', { name: NEW_LINK }) })
			.first();
		const share = card.getByRole('button', { name: 'Share token' });
		if (await share.count()) {
			await share.hover();
			await page.waitForTimeout(400);
			await share.click();
			await settle(page.locator('#share-url'), 6_000);
			await page.locator('#share-url').hover().catch(() => undefined);
		}
		await page.waitForTimeout(Math.max(0, narration.durationFor('link')));
	});

	// The token made on camera, resolved through the API so the guest's half
	// opens exactly the link the organizer just created.
	const tokens = await api(`/api/event-admin/${event.id}/tokens`, { token: org.owner.token });
	const made = (tokens.results ?? []).find((t: { name: string }) => t.name === NEW_LINK);
	if (!made) throw new Error('the link created on camera is not in the token list');

	// ---- Cut: the friend who was not invited, on the event page.
	await episodeCut(page, 'Meanwhile', 'A friend who wasn’t invited', event.path, {
		during: () => switchUser(page, guest.email, guest.password)
	});
	await settle(page.getByRole('button', { name: 'Open notifications' }), 8_000);
	const locked = page.getByText('Invitation required').filter({ visible: true }).first();
	await settle(locked, 10_000);
	narration.mark('locked');
	await withOverlay(page, 'locked', async () => {
		await page.waitForTimeout(1200);
		await locked.hover().catch(() => undefined);
		await page.waitForTimeout(Math.max(0, narration.durationFor('locked')));
	});

	// ---- Cut: the link arrives. The preview endpoint is anonymous and shares
	// this host's rate limit with every other recorder, so the side page opens
	// the preview first and only hands over once it actually rendered.
	const joinPath = `/join/event/${made.id}`;
	await episodeCut(page, 'A message later', 'The link arrives', joinPath, {
		during: async () => {
			const side = await page.context().newPage();
			for (let i = 0; i < 8; i++) {
				await side.goto(joinPath).catch(() => undefined);
				if (await side.getByText("You've been invited!").isVisible({ timeout: 4_000 }).catch(() => false)) break;
				await side.waitForTimeout(5_000);
			}
			await side.close();
		}
	});
	await settle(page.getByRole('button', { name: 'Claim Invitation' }), 12_000);
	await settle(page.getByRole('button', { name: 'Open notifications' }), 8_000);
	await settle(page.getByText('Mira', { exact: true }).filter({ visible: true }).first(), 6_000);
	await page.mouse.move(1500, 700);
	narration.mark('preview');
	await withOverlay(page, 'preview', async () => {
		await page.waitForTimeout(1500);
		// Point at the limits box without covering its numbers.
		await page.mouse.move(1235, 515, { steps: 12 });
		await page.waitForTimeout(Math.max(0, narration.durationFor('preview')));
	});

	// ---- Scene: claim it, land on the event page, say yes.
	narration.mark('claim');
	await withOverlay(page, 'claim', async () => {
		const claim = page.getByRole('button', { name: 'Claim Invitation' });
		await claim.hover();
		await page.waitForTimeout(500);
		await claim.click();
		await page.waitForURL((u) => u.pathname.endsWith(event.path), { timeout: 20_000 }).catch(() => undefined);
		const yes = page.getByRole('button', { name: /RSVP Yes/ }).filter({ visible: true }).first();
		await settle(yes, 15_000);
		await page.waitForTimeout(1400);
		await yes.hover().catch(() => undefined);
		await page.waitForTimeout(500);
		await yes.click().catch(() => undefined);
		// Some events ask for a note first; this one does not, but be safe.
		const confirm = page.getByRole('dialog').getByRole('button', { name: 'RSVP Yes' });
		if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) await confirm.click();
		await settle(page.getByText("You're attending").filter({ visible: true }).first(), 10_000);
		// Blank panel space — not a button, which would light up under the cursor.
		await page.mouse.move(1000, 1000, { steps: 10 });
		await page.waitForTimeout(Math.max(3000, narration.durationFor('claim')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
