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
//   "…Waitlists and invitations, on every event you run."   83 chars
//   "Revenue and V A T, worked out for you."                 38
//   "Your own venues, with their own seating maps."          45
//   "And every ticket and attendee in one place."            43
// The venues slot points at the venue's LAYOUT DESIGNER, not the venues list:
// the line promises seating maps, so show the actual map — stage, sectors and
// every seat — from the organizer's side. Its URL carries a venue id that is
// regenerated on each reseed, so it is resolved at runtime below.
// The tickets slot points at ONE EVENT's ticket list, not the org-wide
// /admin/tickets: that page is only "Select an event to manage its tickets" —
// a list of event names with no ticket and no attendee on it, which is the
// opposite of what the line promises. The event page opens straight onto the
// money and the counts — 42 tickets, 37 active, 5 pending, 0 checked in — and
// that header IS the shot. It deliberately does NOT scroll into the table
// below: the seeded door list is "Bootstrap Guest 4" and
// "concert-filler-31@bootstrap.example", which reads as QA data on camera. It
// is also the last screen of the line and gets whatever the three navigations
// before it leave behind, so a screen that needs no scroll to land is the one
// that survives. Its URL carries an event id regenerated on each reseed, so
// it is resolved at runtime below.
const MONTAGE = [
	{ path: `/org/${ORG}/admin/events`, weight: 0.4, scroll: 260 }, // waitlists + invitations
	{ path: `/org/${ORG}/admin/financials`, weight: 0.18, scroll: 260 }, // revenue and VAT
	{ path: '', weight: 0.21, scroll: 620 }, // ← seat map (layout designer)
	{ path: '', weight: 0.21, scroll: 0 } // ← one event's ticket list (tickets + attendees)
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
	// auth, no extra session round-trip. Deliberately not pre-warmed: measured
	// cold and warm, that page loads in the same second either way, and one
	// take was lost to a dropped session after too many parallel loads. If the
	// seed ever moves, fall back to the org-wide list rather than 404 on camera.
	const found = await fetch(`${API}/api/events/${ORG}/event/${TICKETS_EVENT_SLUG}`)
		.then((r) => (r.ok ? r.json() : null))
		.catch(() => null);
	MONTAGE[3].path = found?.id
		? `/org/${ORG}/admin/events/${found.id}/tickets`
		: `/org/${ORG}/admin/tickets`;
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

			// Let the screen register before it moves, but never longer than a
			// fifth of its slot — the short slots have no beat to spare.
			const settle = Math.min(700, Math.max(200, slot * 0.2));
			await page.waitForTimeout(settle);
			const remaining = deadline - Date.now();
			if (screen.scroll && remaining > 600) {
				await glideScroll(page, screen.scroll, Math.min(remaining - 120, 2200));
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
