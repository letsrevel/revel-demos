import { test, withOverlay } from '@argo-video/cli';
import type { Page } from '@playwright/test';
// @ts-expect-error plain JS shared with probes
import { api, login, createEvent, deleteDefaultTier, createTier, registerVerifiedUser } from './arrange-lib.mjs';
import { glideScroll, uiLogin, waitClientAuth, switchUser } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 3 · "Pick your seat". The seeded Revel Events Collective already
// owns the Revel Concert Hall, drawn with an Orchestra and a Balcony and
// painted with price zones. We arrange a fresh chamber-music night at that
// hall with ONE user-choice, pay-at-the-door tier on the Orchestra, door-sell a
// scattering of seats so the map looks lived in, then film the owner on the
// layout designer and a fresh buyer picking two seats.
const CARD = { episode: 3, title: 'Pick your seat', pov: 'the organizer, then a buyer' };
const ORG = 'revel-events-collective';
const OWNER = { email: 'alice.owner@example.com', password: 'password123' };
const EVENT_NAME = 'Chamber Night: Schubert & Friends';

interface Seat {
	id: string;
	label: string;
	is_active: boolean;
	price_category_id: string | null;
}

async function arrange() {
	const ownerToken: string = await login(OWNER.email, OWNER.password);
	const venues = await api(`/api/organization-admin/${ORG}/venues`, { token: ownerToken });
	const venueList = venues.results ?? venues;
	const venue = venueList.find((v: { name: string }) => v.name === 'Revel Concert Hall') ?? venueList[0];
	const sectors = await api(`/api/organization-admin/${ORG}/venues/${venue.id}/sectors`, { token: ownerToken });
	const sector = (sectors.results ?? sectors).find((s: { kind: string; name: string }) => s.kind === 'seated' && s.name === 'Orchestra');
	const sectorDetail = await api(`/api/organization-admin/${ORG}/venues/${venue.id}/sectors/${sector.id}`, { token: ownerToken });
	const seats: Seat[] = sectorDetail.seats;
	const cats = await api(`/api/organization-admin/${ORG}/venues/${venue.id}/price-categories`, { token: ownerToken });
	const catList: { id: string; name: string }[] = cats.results ?? cats;
	const painted = new Set(seats.filter((s) => s.is_active).map((s) => s.price_category_id).filter(Boolean));

	// Self-healing: retire the Chamber Nights left by earlier takes. The delete
	// commits and then a post-commit hook 500s on the now-missing row, so the
	// rejection is expected and the event is in fact gone.
	const stale = await api(`/api/events/?organization_slug=${ORG}&search=Chamber%20Night&page_size=50`, { token: ownerToken });
	for (const old of (stale.results ?? []).filter((e: { name: string }) => e.name === EVENT_NAME)) {
		await api(`/api/event-admin/${old.id}`, { method: 'DELETE', token: ownerToken }).catch(() => undefined);
	}

	const event = await createEvent(ORG, ownerToken, {
		name: EVENT_NAME,
		description:
			'An evening of chamber music in the hall: the Trout Quintet, two Schubert songs with piano, and a short Brahms sextet after the interval. Reserved seating — pick the seats you like.',
		address: venue.address,
		venue_id: venue.id,
		max_attendees: 200
	});
	await deleteDefaultTier(event.id, ownerToken);

	// User-choice needs every painted category of the sector priced (§19.3).
	const category_prices: Record<string, string> = {};
	const premium = catList.find((c) => c.name === 'Orchestra Premium');
	const standard = catList.find((c) => c.name === 'Orchestra Standard');
	if (premium && painted.has(premium.id)) category_prices[premium.id] = '42.00';
	if (standard && painted.has(standard.id)) category_prices[standard.id] = '32.00';
	const tier = await createTier(event.id, ownerToken, {
		name: 'Orchestra seat',
		description: 'A reserved seat in the orchestra. Pay at the door.',
		payment_method: 'at_the_door',
		price: '32.00',
		total_quantity: 120,
		seat_assignment_mode: 'user_choice',
		venue_id: venue.id,
		sector_id: sector.id,
		category_prices
	});

	// A believable house: door-sell a scattering of seats so the map shows
	// sold ones. The buyers are guest users; their emails never reach camera.
	const seatsByLabel = Object.fromEntries(seats.map((s) => [s.label, s]));
	const SOLD = ['A3', 'A4', 'A5', 'A9', 'B2', 'B6', 'B7', 'B8', 'C1', 'C10', 'C11', 'D5', 'D6', 'E3', 'E9', 'F7', 'G2', 'G11', 'H6', 'J4'];
	const buyers = ['mara.lindqvist', 'tobias.wenger', 'ines.fuchs', 'leon.baumann', 'sofia.rinaldi'];
	for (const [i, label] of SOLD.entries()) {
		const seat = seatsByLabel[label];
		if (!seat) continue;
		const who = buyers[i % buyers.length];
		await api(`/api/event-admin/${event.id}/seating/sell`, {
			token: ownerToken,
			body: {
				seat_id: seat.id,
				tier_id: tier.id,
				payment_method: 'at_the_door',
				email: `${who}.${event.id.slice(0, 4)}@example.com`,
				first_name: who.split('.')[0],
				last_name: who.split('.')[1]
			}
		}).catch(() => undefined);
	}

	const buyer = await registerVerifiedUser('seatbuyer', 'Hanna', 'Kovács', { emailLocal: 'hanna.kovacs' });
	const picks = ['C5', 'C6'].map((l) => seatsByLabel[l]);
	return { venue, event, buyer, picks, designerPath: `/org/${ORG}/admin/venues/${venue.id}/designer` };
}

/** Type like a person, not a paste. */
async function typeSlowly(page: Page, locator: ReturnType<Page['getByLabel']>, text: string) {
	await locator.click();
	await locator.pressSequentially(text, { delay: 55 });
}

test('ep-pick-your-seat', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded).
	const { event, buyer, picks, designerPath } = await arrange();

	// ---- Setup (not recorded): the owner is logged in on the recorded page,
	// and the designer bundle is primed on a side page so the first app frame
	// after the title card is the canvas, not a spinner.
	await uiLogin(page, OWNER.email, OWNER.password);
	await waitClientAuth(page);
	const side = await page.context().newPage();
	await side.goto(designerPath);
	await side.locator('svg[aria-label="Seat layout canvas"]').waitFor({ timeout: 30_000 }).catch(() => undefined);
	await side.close();

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene: the layout designer.
	await titleCardCutTo(page, CARD, designerPath);
	const canvas = page.locator('svg[aria-label="Seat layout canvas"]');
	await canvas.waitFor({ timeout: 15_000 }).catch(() => undefined);
	await page.mouse.move(1100, 300);
	narration.mark('designer');
	await withOverlay(page, 'designer', async () => {
		await page.waitForTimeout(600);
		await glideScroll(page, 400, 1600);
		await page.waitForTimeout(300);
		const zoomIn = page.getByRole('button', { name: 'Zoom in' });
		for (let i = 0; i < 3; i++) {
			if (await zoomIn.isVisible().catch(() => false)) await zoomIn.click();
			await page.waitForTimeout(450);
		}
		const picker = page.getByLabel('Selection');
		if (await picker.isVisible().catch(() => false)) {
			await picker.selectOption({ label: 'Orchestra' }).catch(() => undefined);
		}
		await page.waitForTimeout(500);
		// Hover the block so its selection ring shows, then park the cursor on
		// empty canvas beside it rather than on top of the seats being narrated.
		const block = canvas.locator('[role="button"][aria-label^="Sector Orchestra"]').first();
		const box = await block.boundingBox().catch(() => null);
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
			await page.waitForTimeout(400);
			await page.mouse.move(box.x + box.width + 90, box.y + box.height * 0.4, { steps: 14 });
		}
		await page.waitForTimeout(Math.max(1500, narration.durationFor('designer')));
	});

	// ---- Cut: the buyer on the event page.
	await episodeCut(page, 'Meanwhile', 'A buyer picks her seats', event.path, {
		during: () => switchUser(page, buyer.email, buyer.password)
	});
	await waitClientAuth(page).catch(() => undefined);
	const pickButton = page.getByRole('button', { name: /Pick seats/ }).filter({ visible: true }).first();
	await pickButton.waitFor({ timeout: 15_000 });

	// ---- Scene: the seat map.
	narration.mark('map');
	await withOverlay(page, 'map', async () => {
		await page.waitForTimeout(500);
		const heading = page.getByRole('heading', { name: 'Ticket Options' }).filter({ visible: true }).first();
		await heading.scrollIntoViewIfNeeded().catch(() => undefined);
		await page.waitForTimeout(700);
		await pickButton.hover();
		await page.waitForTimeout(500);
		await pickButton.click();
		const dialog = page.locator('[data-testid="seat-picker-dialog"]');
		await dialog.waitFor({ timeout: 15_000 });
		await dialog.locator('svg[aria-label="Seat map"]').waitFor({ timeout: 15_000 }).catch(() => undefined);
		await page.waitForTimeout(800);
		// Drift the cursor across the front rows so the sold seats are seen.
		const soldSeat = dialog.locator('g[data-seat-id][aria-label*="sold"]').first();
		if (await soldSeat.isVisible().catch(() => false)) await soldSeat.hover().catch(() => undefined);
		await page.waitForTimeout(Math.max(1200, narration.durationFor('map')));
	});

	// ---- Scene: pick two seats and reserve.
	narration.mark('pick');
	await withOverlay(page, 'pick', async () => {
		const dialog = page.locator('[data-testid="seat-picker-dialog"]');
		for (const seat of picks) {
			const g = dialog.locator(`[data-seat-id="${seat.id}"]`);
			await g.hover();
			await page.waitForTimeout(350);
			await g.click();
			await page.waitForTimeout(900);
		}
		await page.waitForTimeout(600);
		await dialog.getByRole('button', { name: 'Done' }).click();
		const bar = page.locator('[data-testid="cart-summary-bar"]');
		await bar.waitFor({ timeout: 10_000 });
		await page.waitForTimeout(900);
		await bar.getByRole('button', { name: 'Buy' }).click();
		const sheet = page.getByRole('dialog').filter({ hasText: 'Checkout' });
		if (await sheet.isVisible({ timeout: 4_000 }).catch(() => false)) {
			await page.waitForTimeout(500);
			const names = sheet.getByLabel(/Name for ticket/);
			const n = await names.count();
			const holders = ['Hanna Kovács', 'Milo Kovács'];
			for (let i = 0; i < n; i++) await typeSlowly(page, names.nth(i), holders[i] ?? holders[0]);
			await page.waitForTimeout(500);
			await sheet.getByRole('button', { name: 'Reserve' }).click();
		}
		await page
			.getByText(/Ticket\(s\) (reserved|claimed)/)
			.first()
			.waitFor({ timeout: 15_000 })
			.catch(() => undefined);
		await page.waitForTimeout(Math.max(2200, narration.durationFor('pick')));
	});

	// ---- Cut: the ticket in the buyer's dashboard.
	await episodeCut(page, 'Afterwards', 'The ticket, in your dashboard', '/dashboard/tickets');
	await waitClientAuth(page).catch(() => undefined);
	const view = page.getByRole('button', { name: 'View ticket and QR' }).first();
	await view.waitFor({ timeout: 15_000 });
	await page.waitForTimeout(700);
	await view.hover();
	await page.waitForTimeout(300);
	await view.click();
	const modal = page.getByRole('dialog');
	await modal.waitFor({ timeout: 10_000 });
	await modal.getByText(/Row /).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
	narration.mark('ticket');
	await withOverlay(page, 'ticket', async () => {
		await page.waitForTimeout(800);
		// Rest the cursor just past the end of the seat line, not on the words.
		const seatLine = modal.getByText(/Row /).first();
		const box = await seatLine.boundingBox().catch(() => null);
		if (box) await page.mouse.move(box.x + box.width + 28, box.y + box.height / 2, { steps: 12 });
		await page.waitForTimeout(Math.max(1500, narration.durationFor('ticket')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
