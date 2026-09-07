import { test, withOverlay } from '@argo-video/cli';
import type { Page } from '@playwright/test';
// @ts-expect-error plain JS shared with probes
import { api, createDressedOrg, createEvent, defaultMembershipTier, makeMember, registerVerifiedUser } from './arrange-lib.mjs';
import { glideScroll, uiLogin, switchUser, waitClientAuth } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 14 · "Who can see it, who can come". Two dials on every event —
// visibility (who can find the page) and event type (who may attend) — shown
// on the organizer's form, then proven through two pairs of eyes: an outsider
// who can see the members' night but not R S V P, and a member for whom it
// just works. Three personas, two cuts: an approved exception for this one.
const CARD = { episode: 14, title: 'Who can see it, who can come', pov: 'the organizer, an outsider, then a member' };

/** The account chrome, bounded — a screen that never arrives is worse than a flash. */
async function settleAuth(page: Page, ms: number): Promise<void> {
	await page
		.getByRole('button', { name: 'Open notifications' })
		.waitFor({ timeout: ms })
		.catch(() => undefined);
}

/** Glide so that `loc` sits `offset` px below the top of the viewport. */
async function glideTo(page: Page, loc: ReturnType<Page['locator']>, offset: number, ms: number): Promise<void> {
	const box = await loc.boundingBox().catch(() => null);
	if (!box) return;
	const distance = Math.max(0, Math.round(box.y - offset));
	if (distance > 8) await glideScroll(page, distance, ms);
}

// The org name is on camera in every scene, and org names are unique: a
// re-run of "Ottakring Community Choir" would come out as "… Studio" or
// "… II". Rotate the district instead, with a parish-hall address whose
// postcode agrees with the name.
const DISTRICTS: Array<[string, string]> = [
	['Ottakring', 'Pfarrgasse 3, 1160 Vienna, Austria'],
	['Hernals', 'Kalvarienberggasse 28, 1170 Vienna, Austria'],
	['Währing', 'Gentzgasse 60, 1180 Vienna, Austria'],
	['Döbling', 'Billrothstraße 8, 1190 Vienna, Austria'],
	['Meidling', 'Schönbrunner Straße 244, 1120 Vienna, Austria'],
	['Favoriten', 'Quellenstraße 52, 1100 Vienna, Austria'],
	['Simmering', 'Enkplatz 4, 1110 Vienna, Austria'],
	['Penzing', 'Linzer Straße 33, 1140 Vienna, Austria'],
	['Brigittenau', 'Wallensteinplatz 6, 1200 Vienna, Austria'],
	['Alsergrund', 'Servitengasse 9, 1090 Vienna, Austria']
];
async function pickChoir(): Promise<{ name: string; address: string }> {
	const res = (await api(`/api/organizations/?search=${encodeURIComponent('Community Choir')}&page_size=100`)) as {
		results?: Array<{ name: string }>;
	};
	const taken = new Set((res.results ?? []).map((o) => o.name));
	for (const [district, address] of DISTRICTS) {
		const name = `${district} Community Choir`;
		if (!taken.has(name)) return { name, address };
	}
	return { name: 'Ottakring Community Choir', address: DISTRICTS[0][1] };
}

test('ep-visibility-eligibility', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a choir, one member, one outsider, and three
	// open R S V P events across the visibility / event-type matrix.
	const choir = await pickChoir();
	const org = await createDressedOrg({
		name: choir.name,
		description:
			'Forty voices from the district, no auditions, no sheet-music snobbery. We rehearse on Tuesdays in the parish hall and sing wherever people will have us. Come and listen first; join when you are ready.',
		address: choir.address
	});
	const owner = org.owner;
	// Cards on the org page print the CITY, not the address — without one they
	// read "TBD" under every event.
	const cities = (await api(`/api/cities/?search=${encodeURIComponent('Vienna')}&page_size=5`)) as {
		results?: Array<{ id: number; name: string }>;
	};
	const vienna = (cities.results ?? []).find((c) => c.name === 'Vienna') ?? null;
	const dayMs = 24 * 60 * 60 * 1000;
	const evening = (daysAhead: number): Date => {
		const d = new Date(Date.now() + daysAhead * dayMs);
		d.setUTCHours(17, 30, 0, 0);
		return d;
	};
	const mk = async (daysAhead: number, overrides: Record<string, unknown>) => {
		const start = evening(daysAhead);
		return createEvent(org.slug, owner.token, {
			requires_ticket: false,
			max_attendees: 0,
			// Street only: the event pages append the city themselves, and a full
			// address would print "…, Vienna, Austria, Vienna, Austria".
			address: choir.address.split(',')[0],
			...(vienna ? { city_id: vienna.id } : {}),
			start: start.toISOString(),
			end: new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
			...overrides
		});
	};
	await mk(5, {
		name: 'Open Rehearsal',
		visibility: 'public',
		event_type: 'public',
		description:
			'Our regular Tuesday rehearsal, doors open. Sit at the back, hum along, or just see how it feels. No experience needed and nobody will make you sing alone.'
	});
	const night = await mk(9, {
		name: "Members' Night",
		visibility: 'public',
		event_type: 'members-only',
		description:
			'A long evening for the choir itself: the new autumn programme, a first read-through of the Brahms, and soup afterwards. Members only, but the page is public so friends know what we are up to.'
	});
	await mk(12, {
		name: 'Committee Meeting',
		visibility: 'members-only',
		event_type: 'members-only',
		description:
			'Quarterly committee: the budget, the spring concert venue, and who is bringing the soup next time. Members only, and not listed outside the choir.'
	});
	const tier = await defaultMembershipTier(org.slug, owner.token);
	const member = await registerVerifiedUser('member', 'Lena', 'Hartmann', { emailLocal: 'lena.hartmann' });
	await makeMember(org.slug, member.token, owner.token, tier.id);
	const outsider = await registerVerifiedUser('outsider', 'Bea', 'Novak', { emailLocal: 'bea.novak' });

	const editPath = `/org/${org.slug}/admin/events/${night.id}/edit`;
	const orgPath = `/org/${org.slug}`;

	// ---- Setup (not recorded): log in as the owner so the first page carries
	// auth, and prime the admin bundle so hydration lands sooner under the cover.
	await uiLogin(page, owner.email, owner.password);
	await waitClientAuth(page);
	const primer = await page.context().newPage();
	await primer.goto(editPath).catch(() => undefined);
	await primer.waitForLoadState('networkidle').catch(() => undefined);
	await primer.close();

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene: the two dials on the Members' Night edit form.
	await titleCardCutTo(page, CARD, editPath);
	await settleAuth(page, 4000);
	const visGroup = page.getByRole('radiogroup', { name: 'Event visibility' });
	const typeGroup = page.getByRole('radiogroup', { name: 'Event type' });
	await visGroup.waitFor({ timeout: 10_000 }).catch(() => undefined);
	await page.mouse.move(1600, 700);
	narration.mark('dials');
	await withOverlay(page, 'dials', async () => {
		await page.waitForTimeout(700);
		// The form opens on the name and dates; the dials are a screen down.
		// Land the Visibility label just under the sticky save bar.
		await glideTo(page, visGroup, 200, 2600);
		await page.waitForTimeout(1400);
		const visMembers = visGroup.getByText('Organization members only');
		if (await visMembers.isVisible().catch(() => false)) await visMembers.hover().catch(() => undefined);
		await page.waitForTimeout(2600);
		// Down to the explainer box and the Event Type cards, so the dynamic
		// "Who can view / who can attend" summary sits at the foot of the frame.
		await glideTo(page, typeGroup, 330, 2600);
		await page.waitForTimeout(600);
		const typeMembers = typeGroup.getByText('Organization members only');
		if (await typeMembers.isVisible().catch(() => false)) await typeMembers.hover().catch(() => undefined);
		await page.waitForTimeout(Math.max(1500, narration.durationFor('dials')));
	});

	// ---- Cut: the outsider on the choir's page.
	await episodeCut(page, 'Same choir, other eyes', 'Bea, who is not a member', orgPath, {
		during: () => switchUser(page, outsider.email, outsider.password)
	});
	await settleAuth(page, 4000);
	const eventsSection = page.locator('section[aria-labelledby="events-heading"]');
	const eventsHeading = page.getByRole('heading', { name: 'Events' }).filter({ visible: true }).first();
	await eventsSection
		.getByRole('link', { name: /Members' Night/ })
		.first()
		.waitFor({ timeout: 10_000 })
		.catch(() => undefined);
	await page.mouse.move(1700, 900);
	narration.mark('outsider-list');
	await withOverlay(page, 'outsider-list', async () => {
		await page.waitForTimeout(600);
		// The org header fills the first screen; the event cards are below it.
		await glideTo(page, eventsHeading, 150, 2400);
		await page.waitForTimeout(1200);
		const rehearsal = eventsSection.getByRole('link', { name: /Open Rehearsal/ }).first();
		if (await rehearsal.isVisible().catch(() => false)) await rehearsal.hover().catch(() => undefined);
		await page.waitForTimeout(1600);
		const nightCard = eventsSection.getByRole('link', { name: /Members' Night/ }).first();
		if (await nightCard.isVisible().catch(() => false)) await nightCard.hover().catch(() => undefined);
		await page.waitForTimeout(Math.max(1200, narration.durationFor('outsider-list')));
	});
	// Open the members' night — a client-side navigation, on camera.
	const nightCardOut = eventsSection.getByRole('link', { name: /Members' Night/ }).first();
	if (await nightCardOut.isVisible().catch(() => false)) {
		await nightCardOut.click();
	} else {
		await page.goto(night.path);
	}
	await page.waitForURL(new RegExp(`/events/${org.slug}/${night.slug}`), { timeout: 15_000 }).catch(() => undefined);
	const membersOnly = page.getByRole('status').filter({ hasText: 'Members only' }).first();
	await membersOnly.waitFor({ timeout: 10_000 }).catch(() => undefined);
	await page.mouse.move(1700, 400);
	await page.waitForTimeout(500);
	narration.mark('outsider-page');
	await withOverlay(page, 'outsider-page', async () => {
		await page.waitForTimeout(2200);
		if (await membersOnly.isVisible().catch(() => false)) await membersOnly.hover().catch(() => undefined);
		await page.waitForTimeout(2600);
		const join = page.getByRole('button', { name: 'Join Organization' }).first();
		if (await join.isVisible().catch(() => false)) await join.hover().catch(() => undefined);
		await page.waitForTimeout(Math.max(1500, narration.durationFor('outsider-page')));
	});

	// ---- Cut: the member on the same page.
	await episodeCut(page, 'Same choir, other eyes', 'Lena, who sings in it', orgPath, {
		during: () => switchUser(page, member.email, member.password)
	});
	await settleAuth(page, 4000);
	await eventsSection
		.getByRole('link', { name: /Committee Meeting/ })
		.first()
		.waitFor({ timeout: 10_000 })
		.catch(() => undefined);
	await page.mouse.move(1700, 900);
	narration.mark('member-list');
	await withOverlay(page, 'member-list', async () => {
		await page.waitForTimeout(500);
		await glideTo(page, eventsHeading, 150, 2200);
		await page.waitForTimeout(600);
		const committee = eventsSection.getByRole('link', { name: /Committee Meeting/ }).first();
		if (await committee.isVisible().catch(() => false)) await committee.hover().catch(() => undefined);
		await page.waitForTimeout(Math.max(1200, narration.durationFor('member-list')));
	});
	const nightCardMem = eventsSection.getByRole('link', { name: /Members' Night/ }).first();
	if (await nightCardMem.isVisible().catch(() => false)) {
		await nightCardMem.hover().catch(() => undefined);
		await page.waitForTimeout(400);
		await nightCardMem.click();
	} else {
		await page.goto(night.path);
	}
	await page.waitForURL(new RegExp(`/events/${org.slug}/${night.slug}`), { timeout: 15_000 }).catch(() => undefined);
	const yes = page.getByRole('button', { name: "RSVP Yes - I'm attending" }).filter({ visible: true }).first();
	await yes.waitFor({ timeout: 10_000 }).catch(() => undefined);
	await page.mouse.move(1700, 400);
	await page.waitForTimeout(500);
	narration.mark('member-rsvp');
	await withOverlay(page, 'member-rsvp', async () => {
		await page.waitForTimeout(1800);
		if (await yes.isVisible().catch(() => false)) {
			await yes.hover();
			await page.waitForTimeout(700);
			await yes.click();
			// This build submits straight away: the buttons give way to a status.
			await page
				.getByRole('status')
				.filter({ hasText: "You're attending" })
				.first()
				.waitFor({ timeout: 15_000 })
				.catch(() => undefined);
		}
		await page.mouse.move(1700, 600);
		// Let the green "You're attending" sit before the end card takes over.
		await page.waitForTimeout(Math.max(2800, narration.durationFor('member-rsvp')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
