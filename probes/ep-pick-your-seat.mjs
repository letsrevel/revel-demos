// Probe for Episode 3 · "Pick your seat". Arranges a fresh seated event on the
// seeded org's Revel Concert Hall, verifies the tier config via the API, then
// walks every page/selector the episode touches. `node probes/ep-pick-your-seat.mjs`
import { chromium } from 'playwright';
import { api, login, createEvent, deleteDefaultTier, createTier, registerVerifiedUser } from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const ORG = 'revel-events-collective';

// ---- Arrange -------------------------------------------------------------
const ownerToken = await login('alice.owner@example.com', 'password123');
const venues = await api(`/api/organization-admin/${ORG}/venues`, { token: ownerToken });
const venue = (venues.results ?? venues).find((v) => v.name === 'Revel Concert Hall') ?? (venues.results ?? venues)[0];
const sectors = await api(`/api/organization-admin/${ORG}/venues/${venue.id}/sectors`, { token: ownerToken });
const sector = (sectors.results ?? sectors).find((s) => s.kind === 'seated' && s.name === 'Orchestra');
const sectorDetail = await api(`/api/organization-admin/${ORG}/venues/${venue.id}/sectors/${sector.id}`, { token: ownerToken });
const cats = await api(`/api/organization-admin/${ORG}/venues/${venue.id}/price-categories`, { token: ownerToken });
const catList = cats.results ?? cats;
const painted = new Set(sectorDetail.seats.filter((s) => s.is_active).map((s) => s.price_category_id).filter(Boolean));
console.log('venue', venue.id, venue.name, '| sector', sector.name, sector.id, '| painted categories', [...painted].map((id) => catList.find((c) => c.id === id)?.name));

// Self-healing: retire the Chamber Nights left by earlier takes so the org's
// event list does not fill up with duplicates.
const EVENT_NAME = 'Chamber Night: Schubert & Friends';
const stale = await api(`/api/events/?organization_slug=${ORG}&search=Chamber%20Night&page_size=50`, { token: ownerToken });
for (const old of (stale.results ?? []).filter((e) => e.name === EVENT_NAME)) {
	// The delete commits, then a post-commit waitlist hook 500s on the now-missing
	// row — so the response is an error while the event is in fact gone.
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
const premium = catList.find((c) => c.name === 'Orchestra Premium');
const standard = catList.find((c) => c.name === 'Orchestra Standard');
const category_prices = {};
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
const tierCheck = await api(`/api/event-admin/${event.id}/ticket-tier/${tier.id}`, { token: ownerToken }).catch(() => tier);
console.log('tier', JSON.stringify({ mode: tierCheck.seat_assignment_mode, sector: tierCheck.sector?.id, pm: tierCheck.payment_method, price: tierCheck.price, cats: tierCheck.category_prices, gaps: tierCheck.pricing_gaps }));
if (tierCheck.seat_assignment_mode !== 'user_choice' || (tierCheck.sector?.id ?? tierCheck.sector_id) !== sector.id) throw new Error('tier mode/sector did not stick');
if ((tierCheck.pricing_gaps ?? []).length) throw new Error('pricing gaps: ' + JSON.stringify(tierCheck.pricing_gaps));

// A believable house: door-sell a scattering of seats so the map shows sold ones.
const seatsByLabel = Object.fromEntries(sectorDetail.seats.map((s) => [s.label, s]));
const SOLD = ['A3', 'A4', 'A5', 'A9', 'B2', 'B6', 'B7', 'B8', 'C1', 'C10', 'C11', 'D5', 'D6', 'E3', 'E9', 'F7', 'G2', 'G11', 'H6', 'J4'];
const buyers = ['mara.lindqvist', 'tobias.wenger', 'ines.fuchs', 'leon.baumann', 'sofia.rinaldi'];
let sold = 0;
for (const [i, label] of SOLD.entries()) {
	const seat = seatsByLabel[label];
	if (!seat) continue;
	await api(`/api/event-admin/${event.id}/seating/sell`, {
		token: ownerToken,
		body: { seat_id: seat.id, tier_id: tier.id, payment_method: 'at_the_door', email: `${buyers[i % buyers.length]}.${event.id.slice(0, 4)}@example.com`, first_name: buyers[i % buyers.length].split('.')[0], last_name: buyers[i % buyers.length].split('.')[1] }
	}).then(() => sold++).catch((e) => console.log('  door-sale failed', label, String(e).slice(0, 200)));
}
console.log('door-sold', sold, 'seats');
const avail = await api(`/api/events/${event.id}/seating/availability`);
console.log('availability: sold', Object.values(avail.seats ?? {}).filter((v) => v === 'sold').length);

const buyer = await registerVerifiedUser('seatbuyer', 'Hanna', 'Kovács', { emailLocal: 'hanna.kovacs' });
console.log('arrange OK', event.path, 'buyer', buyer.email);

// Free seats to click on camera: two adjacent in row C (premium) that are not sold.
const target = ['C5', 'C6'].map((l) => seatsByLabel[l]);
console.log('target seats', target.map((s) => s.label + ' ' + s.id));

if (process.env.ARRANGE_ONLY) process.exit(0);

// ---- Browser walk ---------------------------------------------------------
const SHOT = '/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-pick-your-seat';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

async function uiLogin(email, password) {
	await page.goto(BASE + '/login');
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	const reveal = page.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
	await page.getByLabel('Email address').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
}
async function logout() {
	const side = await context.newPage();
	await side.goto(BASE + '/logout');
	await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
	await side.close();
}

// Persona A: the owner on the layout designer.
await uiLogin('alice.owner@example.com', 'password123');
const designerPath = `/org/${ORG}/admin/venues/${venue.id}/designer`;
let t0 = Date.now();
await page.goto(BASE + designerPath);
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
const canvas = page.locator('svg[aria-label="Seat layout canvas"]');
await canvas.waitFor({ timeout: 20000 });
console.log('designer: canvas visible after', Date.now() - t0, 'ms; heading:', await page.getByRole('heading', { level: 1 }).first().textContent().catch(() => '?'));
const sectorBlocks = page.locator('svg[aria-label="Seat layout canvas"] [role="button"]');
console.log('designer: role=button groups', await sectorBlocks.count(), (await sectorBlocks.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join(' | '));
const picker = page.getByLabel('Selection');
console.log('designer: Selection picker count', await picker.count(), 'options', await picker.locator('option').allTextContents().catch(() => []));
await page.screenshot({ path: `${SHOT}/probe-designer-0.png` });
await picker.selectOption({ label: 'Orchestra' });
await page.waitForTimeout(600);
console.log('designer: toolbar after select →', (await page.locator('button').allTextContents()).filter((s) => /shape|seats|Save|Done/.test(s)).join(' | '));
const orch = page.locator('svg[aria-label="Seat layout canvas"] [role="button"][aria-label^="Sector Orchestra"]');
const box = await orch.boundingBox();
console.log('designer: Orchestra block box', JSON.stringify(box));
await page.screenshot({ path: `${SHOT}/probe-designer-1.png` });

// Persona B: the buyer on the event page → seat map → two seats → Buy.
await logout();
await uiLogin(buyer.email, buyer.password);
t0 = Date.now();
await page.goto(BASE + event.path);
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
console.log('event page loaded in', Date.now() - t0, 'ms; title', await page.title());
const tbd = await page.getByText('Location TBD').count();
console.log('event page: "Location TBD" occurrences', tbd);
const pick = page.getByRole('button', { name: /Pick seats/ }).filter({ visible: true }).first();
await pick.waitFor({ timeout: 15000 });
await pick.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${SHOT}/probe-event-0.png` });
await pick.click();
const dialog = page.locator('[data-testid="seat-picker-dialog"]');
await dialog.waitFor({ timeout: 15000 });
await page.waitForTimeout(1500);
console.log('picker: title', await dialog.getByRole('heading').first().textContent());
const mapSvg = dialog.locator('svg[aria-label="Seat map"]');
const listBtns = dialog.locator('button[aria-label^="Seat "]');
console.log('picker: map svg', await mapSvg.count(), '| list buttons', await listBtns.count());
const viewToggle = dialog.getByRole('group', { name: 'Seat display' });
console.log('picker: view toggle present', await viewToggle.count());
const soldSeats = dialog.locator('g[data-seat-id][aria-label*="sold"]');
console.log('picker: sold seats on map', await soldSeats.count());
await page.screenshot({ path: `${SHOT}/probe-picker-0.png` });
for (const seat of target) {
	const g = dialog.locator(`[data-seat-id="${seat.id}"]`);
	console.log(`picker: seat ${seat.label} count`, await g.count(), 'label', await g.getAttribute('aria-label'), 'box', JSON.stringify(await g.boundingBox()));
	await g.click();
	await page.waitForTimeout(900);
	console.log(`picker: after click ${seat.label} → aria-pressed`, await g.getAttribute('aria-pressed'));
}
console.log('picker: footer text', (await dialog.textContent()).match(/\d+ selected/)?.[0], '| hold notice', await dialog.getByRole('status').allTextContents());
await page.screenshot({ path: `${SHOT}/probe-picker-1.png` });
const avail2 = await api(`/api/events/${event.id}/seating/availability`, { token: buyer.token });
console.log('api: my holds', JSON.stringify(avail2.my_holds ?? avail2.holds ?? Object.keys(avail2)));
await dialog.getByRole('button', { name: 'Done' }).click();
const bar = page.locator('[data-testid="cart-summary-bar"]');
await bar.waitFor({ timeout: 10000 });
console.log('cart bar:', (await bar.textContent()).replace(/\s+/g, ' ').trim());
await page.screenshot({ path: `${SHOT}/probe-cart-0.png` });
await bar.getByRole('button', { name: 'Buy' }).click();
const sheet = page.getByRole('dialog').filter({ hasText: 'Checkout' });
if (await sheet.isVisible({ timeout: 3000 }).catch(() => false)) {
	console.log('checkout sheet opened; buttons:', await sheet.getByRole('button').allTextContents());
	console.log('checkout sheet text:', (await sheet.textContent()).replace(/\s+/g, ' ').trim().slice(0, 600));
	console.log('checkout sheet textboxes:', await sheet.getByRole('textbox').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.id || e.name)));
	await page.screenshot({ path: `${SHOT}/probe-sheet-0.png` });
	const nameFields = sheet.getByLabel(/Name for ticket/);
	const n = await nameFields.count();
	for (let i = 0; i < n; i++) await nameFields.nth(i).fill(i === 0 ? 'Hanna Kovács' : 'Milo Kovács');
	await page.waitForTimeout(400);
	await page.screenshot({ path: `${SHOT}/probe-sheet-1.png` });
	await sheet.getByRole('button', { name: 'Reserve' }).click({ timeout: 10000 });
} else console.log('no checkout sheet (direct buy)');
const toast = page.getByText(/reserved|claimed/i).first();
await toast.waitFor({ timeout: 15000 });
console.log('toast:', await toast.textContent());
await page.waitForTimeout(1500);
const modalSeat = page.getByRole('dialog').getByText(/Row C/).first();
console.log('auto ticket modal shows seat:', await modalSeat.isVisible().catch(() => false), await modalSeat.textContent().catch(() => ''));
await page.screenshot({ path: `${SHOT}/probe-after-buy.png` });

// Dashboard tickets.
await page.goto(BASE + '/dashboard/tickets');
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
await page.waitForLoadState('networkidle').catch(() => undefined);
const viewBtns = page.getByRole('button', { name: 'View ticket and QR' });
console.log('dashboard: ticket cards', await viewBtns.count(), '| body text has event name', (await page.textContent('body')).includes('Chamber Night'));
await page.screenshot({ path: `${SHOT}/probe-dashboard-0.png` });
await viewBtns.first().click();
const modal = page.getByRole('dialog');
await modal.waitFor({ timeout: 10000 });
await page.waitForTimeout(800);
console.log('ticket modal seat text:', await modal.getByText(/Row/).allTextContents(), '| ticket x of y:', await modal.getByText(/Ticket \d of \d/).allTextContents());
await page.screenshot({ path: `${SHOT}/probe-ticket-modal.png` });
const tickets = await api('/api/me/tickets?page_size=20', { token: buyer.token }).catch(() => ({}));
console.log('api: my tickets', (tickets.results ?? []).map((tk) => [tk.status, tk.seat?.label ?? tk.seat]).slice(0, 5));

await browser.close();
console.log('PROBE PASSED');
