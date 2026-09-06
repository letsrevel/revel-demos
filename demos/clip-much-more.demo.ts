import { test, withOverlay } from '@argo-video/cli';
import { gotoClean, waitClientAuth, uiLogin, glideScroll, showEndCard } from './clip-helpers';

test.use({ bypassCSP: true });

const OWNER = 'alice.owner@example.com';
const PASSWORD = 'password123';
const ORG = 'revel-events-collective';
const API = process.env.API_URL || 'http://localhost:8000';

// The busiest seeded event in this org — 42 tickets across two tiers, with
// seat assignments, mixed payment methods and a pending/active split. Its
// admin ticket list is the only screen that actually shows tickets AND
// attendees; the org-wide /admin/tickets is just an event picker.
const TICKETS_EVENT_SLUG = 'classical-music-evening';

// One screen per clause of the narration, in the order the clause is spoken.
// `weight` is that clause's share of the line, so each screen is on camera for
// as long as its sentence takes — the montage stays in sync with the voice
// however long the TTS clip turns out to be.
//
// Screens are picked because they hold real seeded content: an empty table
// reads as a broken product on camera, and so does a screen of QA fixtures.
// Cut after reviewing frames: /announcements is empty, and /members on this org
// is the standard seed's test data ("Past Due", "E2E Revival Tier", test.*).
// Weights are each clause's share of the line's characters, so the screen
// changes land on the sentence breaks:
//   "…Waitlists and invitations, on every event you run."    83 chars
//   "Revenue and V A T, worked out for you."                  38
//   "Your own venues, with their own seating maps."           45
//   "And every ticket and attendee in one place. Cash at the
//    door, a bank transfer, or card online. All of it tracked
//    the same way."                                          126
// The venues slot points at the venue's LAYOUT DESIGNER, not the venues list:
// the line promises seating maps, so show the actual map — stage, sectors and
// every seat — from the organizer's side. Its URL carries a venue id that is
// regenerated on each reseed, so it is resolved at runtime below.
// The tickets slot points at ONE EVENT's ticket list, not the org-wide
// /admin/tickets: that page is only "Select an event to manage its tickets" —
// a list of event names with no ticket and no attendee on it, which is the
// opposite of what the line promises. It carries two clauses now, so it holds
// nearly half the line and has the room to travel: it opens on the money and
// the counts (42 tickets, 37 active, 5 pending), then drifts down through the
// payment-method filters — Online (Stripe), Offline, At the Door, Free — and
// into the door list itself, which is exactly what the cash-and-transfers
// sentence is describing. One continuous slow glide rather than a scroll and a
// hold: the seeded attendees are "Bootstrap Guest 4" and
// "concert-filler-31@bootstrap.example", and motion carries past a name where
// a static frame invites reading it. Its URL carries an event id regenerated
// on each reseed, so it is resolved at runtime below.
const MONTAGE = [
	{ path: `/org/${ORG}/admin/events`, weight: 0.284, scroll: 260 }, // waitlists + invitations
	{ path: `/org/${ORG}/admin/financials`, weight: 0.13, scroll: 260 }, // revenue and VAT
	{ path: '', weight: 0.154, scroll: 620 }, // ← seat map (layout designer)
	{ path: '', weight: 0.432, scroll: 820 } // ← one event's tickets: counts → filters → door list
];

test('clip-much-more', async ({ page, narration }) => {
	test.setTimeout(300_000);

	// ---- Setup (not recorded).
	await uiLogin(page, OWNER, PASSWORD);
	// The auth bootstrap is waited for HERE, on the dashboard. Waiting for the
	// bell again after landing on a heavy admin page raced and cost a take.
	await waitClientAuth(page);

	// Resolve the layout designer's URL on a second, UNRECORDED page (and warm
	// it, so the montage navigation is a cache hit).
	const side = await page.context().newPage();
	await side.goto(`/org/${ORG}/admin/venues`);
	await side.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await side.waitForLoadState('networkidle').catch(() => undefined);
	await side.getByRole('button', { name: 'Manage sectors' }).first().click();
	const designerLink = side.getByRole('link', { name: 'Open layout designer' }).first();
	await designerLink.waitFor({ timeout: 20_000 });
	MONTAGE[2].path = (await designerLink.getAttribute('href')) ?? `/org/${ORG}/admin/venues`;
	await side.goto(MONTAGE[2].path).catch(() => undefined);
	await side.waitForLoadState('networkidle').catch(() => undefined);

	// Resolve the ticket screen's event id off the PUBLIC event endpoint — no
	// auth needed. If the seed ever moves, fall back to the org-wide list
	// rather than 404 on camera.
	const found = await fetch(`${API}/api/events/${ORG}/event/${TICKETS_EVENT_SLUG}`)
		.then((r) => (r.ok ? r.json() : null))
		.catch(() => null);
	MONTAGE[3].path = found?.id
		? `/org/${ORG}/admin/events/${found.id}/tickets`
		: `/org/${ORG}/admin/tickets`;
	// Warmed here for the client bundle, not the document: the page's own load
	// measures the same cold or warm, but the recorded cut shows a logged-out
	// header until the client auth bootstrap finishes, and that is what a
	// primed bundle cache shortens. It is also the heaviest page in the
	// montage — 42 rows and their avatars — so it is the one that needs it.
	await side.goto(MONTAGE[3].path).catch(() => undefined);
	await side.waitForLoadState('networkidle').catch(() => undefined);
	await side.close();

	await gotoClean(page, MONTAGE[0].path);
	await page
		.getByRole('heading', { name: 'Manage Events' })
		.filter({ visible: true })
		.first()
		.waitFor({ timeout: 20_000 })
		.catch(() => undefined);
	await page.mouse.move(960, 400);

	await narration.startRecording(page);

	narration.mark('more');
	await withOverlay(page, 'more', async () => {
		const endOfLine = Date.now() + narration.durationFor('more');
		let weightLeft = MONTAGE.reduce((sum, screen) => sum + screen.weight, 0);

		for (const [i, screen] of MONTAGE.entries()) {
			// Navigate FIRST, then divide what is genuinely left. Budgeting the
			// weights against the whole line assumes navigation is free; it is
			// not — each admin page costs a second or more under the recorder,
			// four of them ate a third of the line, and the drift all landed on
			// the last screen, which flashed past in half a second. Sharing out
			// the remaining wall clock after every load keeps the montage in
			// step with the voice and never starves the final screen.
			if (i > 0) await gotoClean(page, screen.path);
			const slot = ((endOfLine - Date.now()) * screen.weight) / weightLeft;
			weightLeft -= screen.weight;
			const deadline = Date.now() + slot;

			// SSR serves the LOGGED-OUT header until the client auth bootstrap
			// lands, so a fast cut onto an admin page shows "Login / Sign Up"
			// over the organizer's own dashboard for a beat. gotoClean's
			// networkidle does not always outlast it. Wait for the account
			// chrome — but bounded by this screen's own slot and swallowed on
			// timeout, because a screen that never arrives is worse than a
			// flash, and an unbounded wait here has cost takes before.
			await page
				.getByRole('button', { name: 'Open notifications' })
				.waitFor({ timeout: Math.max(300, Math.min(2000, slot * 0.6)) })
				.catch(() => undefined);

			// Let the screen register before it moves, but never longer than a
			// fifth of what is left — the short slots have no beat to spare.
			const settle = Math.min(700, Math.max(150, (deadline - Date.now()) * 0.2));
			await page.waitForTimeout(settle);
			const remaining = deadline - Date.now();
			// Capped generously: the tickets screen holds most of the line and
			// wants one slow, continuous drift rather than a quick scroll and a
			// long stare at the bottom of it.
			if (screen.scroll && remaining > 600) {
				await glideScroll(page, screen.scroll, Math.min(remaining - 120, 5000));
			}
			const left = deadline - Date.now();
			if (left > 0) await page.waitForTimeout(left);
		}
		await page.waitForTimeout(Math.max(0, narration.durationFor('more')));
	});

	// ---- The close, on the brand end card.
	// Marked before painting: the export fades through black at every scene
	// boundary, so the swap happens inside that black instead of flashing.
	narration.mark('close');
	await showEndCard(page);
	await page.waitForTimeout(narration.durationFor('close') + 600);
});
