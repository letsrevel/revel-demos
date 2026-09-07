import { test, withOverlay } from '@argo-video/cli';
// @ts-expect-error plain JS shared with probes
import { api, createDressedOrg, createEvent, registerVerifiedUser, rsvpYes } from './arrange-lib.mjs';
import { gotoClean, hideDemoChrome, switchUser, uiLogin, waitClientAuth, waitHydrated } from './clip-helpers';
import { closeEpisode, episodeCut, showTitleCard, titleCardCutTo } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 5 · The waitlist. A full RSVP event seen by the third person to
// arrive: join the waitlist, peek at the organizer's list, then take the
// place when it opens.
//
// The spot is opened OFF camera by raising the event's capacity as the
// owner. That only produces a notification when the event has an advanced
// waitlist (a `waitlist_time_window`), which turns the freed seat into a
// timed offer for the next person in line — see probes/ep-waitlist.mjs for
// what the other triggers do. The offer is also what gives the notification
// card a real deadline instead of an empty "before ." on camera.
const CARD = { episode: 5, title: 'The waitlist', pov: 'the person who got there too late' };

const ADDRESS = 'Zieglergasse 42, 1070 Vienna, Austria';

/** Poll the public event until the two arranged RSVPs are counted. */
async function waitUntilFull(orgSlug: string, eventSlug: string, token: string): Promise<void> {
	for (let i = 0; i < 30; i++) {
		const ev = await api(`/api/events/${orgSlug}/event/${eventSlug}`, { token }).catch(() => null);
		if (ev?.is_full) return;
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error('ep-waitlist: event never reported full');
}

/** Poll the attendee's notifications for the waitlist spot. */
async function waitForSpotNotification(token: string, seconds = 20): Promise<void> {
	const deadline = Date.now() + seconds * 1000;
	while (Date.now() < deadline) {
		const n = await api('/api/notifications?page_size=10', { token }).catch(() => ({}));
		if ((n.results ?? []).some((x: { notification_type: string }) => x.notification_type === 'waitlist_spot_available')) return;
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error('ep-waitlist: no waitlist notification arrived');
}

test('ep-waitlist', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a tiny darkroom night, full, waitlist open.
	const org = await createDressedOrg({
		name: 'The Darkroom Collective',
		description:
			'A shared analog darkroom in Neubau. Two enlargers, a drying line, and people who still like the smell of fixer. Members book the room; on Thursdays we print together.',
		address: ADDRESS
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Darkroom Night: Print Your Own',
		description:
			'Bring your negatives, we bring the chemistry. Two enlargers means two people per night, so places are tight — but there is a waitlist, and people do drop out.',
		address: ADDRESS,
		requires_ticket: false,
		max_attendees: 2,
		waitlist_open: true
	});
	// Advanced waitlist: a freed seat becomes a 24-hour offer to the next in line.
	await api(`/api/event-admin/${event.id}/waitlist-settings`, {
		method: 'PATCH',
		token: org.owner.token,
		body: { waitlist_time_window: 'PT24H' }
	});
	const [mara, tomas, ines] = await Promise.all([
		registerVerifiedUser('a', 'Mara', 'Lindqvist', { emailLocal: 'mara.lindqvist' }),
		registerVerifiedUser('b', 'Tomas', 'Reyes', { emailLocal: 'tomas.reyes' }),
		registerVerifiedUser('c', 'Ines', 'Fournier', { emailLocal: 'ines.fournier' })
	]);
	await rsvpYes(event.id, mara.token);
	await rsvpYes(event.id, tomas.token);
	await waitUntilFull(org.slug, event.slug, ines.token);

	const adminWaitlist = `/org/${org.slug}/admin/events/${event.id}/waitlist`;

	/** Open a third place, as the owner. PUT is a full edit — send the dressing back. */
	const raiseCapacity = () =>
		api(`/api/event-admin/${event.id}`, {
			method: 'PUT',
			token: org.owner.token,
			body: {
				name: event.name,
				description: event.description,
				address: ADDRESS,
				start: event.start,
				end: event.end,
				event_type: 'public',
				visibility: 'public',
				requires_ticket: false,
				max_attendees: 3,
				waitlist_open: true
			}
		});

	// ---- Setup (not recorded): Ines is signed in; prime the event page.
	await uiLogin(page, ines.email, ines.password);
	await gotoClean(page, event.path);
	await waitClientAuth(page);

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene: full — the event page with "Join Waitlist".
	await titleCardCutTo(page, CARD, event.path);
	await waitClientAuth(page).catch(() => undefined);
	await page.mouse.move(1000, 720);
	narration.mark('full');
	await withOverlay(page, 'full', async () => {
		await page.waitForTimeout(1200);
		const join = page.getByRole('button', { name: 'Join Waitlist' }).filter({ visible: true }).first();
		await join.hover();
		await page.waitForTimeout(Math.max(0, narration.durationFor('full') - 2400));
		await join.click();
		await page.mouse.move(1000, 720);
		// The button reads "Success!" and the app reloads the page 1.5 s later.
		await page.waitForTimeout(2200);
	});

	// ---- Scene: queued — the reloaded page, "You're on the Waitlist".
	await page
		.getByRole('button', { name: "You're on the Waitlist" })
		.waitFor({ timeout: 20_000 })
		.catch(() => undefined);
	await waitHydrated(page);
	await hideDemoChrome(page);
	await waitClientAuth(page).catch(() => undefined);
	narration.mark('queued');
	await withOverlay(page, 'queued', async () => {
		await page.waitForTimeout(Math.max(0, narration.durationFor('queued')));
	});

	// ---- Cut: the organizer's waitlist page.
	await episodeCut(page, 'Meanwhile', 'The organizer’s list', adminWaitlist, {
		during: () => switchUser(page, org.owner.email, org.owner.password)
	});
	await waitClientAuth(page).catch(() => undefined);
	await page.mouse.move(1000, 900);
	narration.mark('list');
	await withOverlay(page, 'list', async () => {
		const total = narration.durationFor('list');
		await page.waitForTimeout(Math.max(0, total * 0.45));
		const offer = page.getByRole('button', { name: 'Issue offer' }).filter({ visible: true }).first();
		if (await offer.isVisible().catch(() => false)) await offer.hover();
		await page.waitForTimeout(Math.max(0, narration.durationFor('list')));
	});

	// ---- Cut: back to Ines, after the owner opened a third place.
	await episodeCut(page, 'A little later', 'A place opens up', event.path, {
		during: async () => {
			await raiseCapacity();
			await switchUser(page, ines.email, ines.password);
			await waitForSpotNotification(ines.token);
		}
	});
	await waitClientAuth(page).catch(() => undefined);
	narration.mark('spot');
	await withOverlay(page, 'spot', async () => {
		await page.waitForTimeout(1200);
		const bell = page.getByRole('button', { name: 'Open notifications' });
		await bell.hover();
		await page.waitForTimeout(400);
		await bell.click();
		await page.waitForTimeout(4800);
		await page.keyboard.press('Escape');
		await page.waitForTimeout(700);
		const yes = page.getByRole('button', { name: "RSVP Yes - I'm attending" }).filter({ visible: true }).first();
		await yes.hover();
		await page.waitForTimeout(700);
		await yes.click();
		await page.mouse.move(1000, 720);
		await page.waitForTimeout(Math.max(2600, narration.durationFor('spot')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
