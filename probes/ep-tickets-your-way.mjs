// Probe for Episode 2 · "Tickets, your way". Arranges a dressed org + event
// with three tiers, verifies the tiers through the API (pwyc bounds, payment
// instructions), then walks every selector the episode touches: the owner's
// Ticketing tab, the attendee's ticket options → cart → checkout → reserve →
// ticket modal, and the dashboard ticket card with its wallet buttons.
//
//   node probes/ep-tickets-your-way.mjs
import { chromium } from 'playwright';
import {
	api,
	createDressedOrg,
	createEvent,
	createTier,
	deleteDefaultTier,
	registerVerifiedUser
} from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SHOT = process.env.SHOT_DIR || '';

// ---- Arrange -------------------------------------------------------------
const org = await createDressedOrg({
	name: 'Nightjar Listening Room',
	description:
		'A forty-seat listening room above a bakery in Neubau. Quiet songs, one good piano, and a bar that closes when the music starts. Run by three friends since 2019.',
	address: 'Neubaugasse 36, 1070 Vienna, Austria'
});
const event = await createEvent(org.slug, org.owner.token, {
	name: 'Autumn Session: Quiet Songs',
	description:
		'Two songwriters, one piano, no amplification. Doors at seven, first set at half past. Bring a friend and a low voice.',
	address: 'Neubaugasse 36, 1070 Vienna, Austria',
	max_attendees: 40,
	require_ticket_names: false
});
await deleteDefaultTier(event.id, org.owner.token);
const early = await createTier(event.id, org.owner.token, {
	name: 'Early bird',
	description: 'The first twenty seats, at a friendlier price. Pay by bank transfer within three days.',
	payment_method: 'offline',
	price: '12.00',
	total_quantity: 20,
	manual_payment_instructions:
		'Bank transfer to Nightjar Listening Room, IBAN AT61 1904 3002 3457 3201, reference your name. We confirm within a day.'
});
const pwyc = await createTier(event.id, org.owner.token, {
	name: 'Pay what you can',
	description: 'Pick a number between five and thirty euros and pay it at the door. Nobody asks why.',
	payment_method: 'at_the_door',
	price_type: 'pwyc',
	pwyc_min: '5.00',
	pwyc_max: '30.00',
	total_quantity: 15
});
const volunteers = await createTier(event.id, org.owner.token, {
	name: 'Volunteers',
	description: 'Free entry for the door and bar crew. Show up an hour early.',
	payment_method: 'free',
	price: '0.00',
	total_quantity: 5
});
const attendee = await registerVerifiedUser('attendee', 'Mara', 'Lindqvist', { emailLocal: 'mara.lindqvist' });
console.log('arrange: OK', event.path, 'event id', event.id);
console.log('owner', org.owner.email, '| attendee', attendee.email);

// ---- Verify arranged state via the API (unknown fields are dropped silently)
const tiersRes = await api(`/api/event-admin/${event.id}/ticket-tiers`, { token: org.owner.token });
const tiers = tiersRes.results ?? tiersRes.items ?? tiersRes;
for (const t of tiers) {
	console.log(
		`tier: ${t.name} | ${t.payment_method} | ${t.price_type} | price ${t.price} | pwyc ${t.pwyc_min}–${t.pwyc_max} | qty ${t.total_quantity} | instr ${(t.manual_payment_instructions ?? '').slice(0, 30)}`
	);
}
const p = tiers.find((t) => t.id === pwyc.id);
if (!p || p.price_type !== 'pwyc' || Number(p.pwyc_min) !== 5 || Number(p.pwyc_max) !== 30)
	throw new Error('pwyc bounds did NOT stick: ' + JSON.stringify(p));
const e = tiers.find((t) => t.id === early.id);
if (!e?.manual_payment_instructions) throw new Error('manual_payment_instructions did NOT stick');
if (tiers.length !== 3) throw new Error(`expected 3 tiers, got ${tiers.length}`);
console.log('verify: tiers OK');

// ---- Browser --------------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const shot = async (name) => SHOT && page.screenshot({ path: `${SHOT}/${name}.png` });

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
async function gotoReady(path) {
	await page.goto(BASE + path);
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
	await page.waitForLoadState('networkidle').catch(() => undefined);
}
const vis = (loc) => loc.filter({ visible: true }).first();

// ---- Persona A: owner on the Ticketing tab
await uiLogin(org.owner.email, org.owner.password);
const adminPath = `/org/${org.slug}/admin/events/${event.id}/edit?tab=ticketing`;
await gotoReady(adminPath);
await vis(page.getByRole('heading', { name: 'Ticket Tiers' })).waitFor({ timeout: 15000 });
console.log('owner: Ticket Tiers heading OK at', adminPath);
for (const name of ['Early bird', 'Pay what you can', 'Volunteers']) {
	await vis(page.getByRole('heading', { name })).waitFor({ timeout: 10000 });
}
console.log('owner: three tier headings visible');
const tiersHeading = vis(page.getByRole('heading', { name: 'Ticket Tiers' }));
console.log('owner: Ticket Tiers heading y =', (await tiersHeading.boundingBox())?.y);
const firstTierBox = await vis(page.getByRole('heading', { name: 'Early bird' })).boundingBox();
const lastTierBox = await vis(page.getByRole('heading', { name: 'Volunteers' })).boundingBox();
console.log('owner: tier cards span y', firstTierBox?.y, '→', lastTierBox?.y);
const tabPanel = page.getByRole('tabpanel');
console.log('--- ticketing tab text (first 900) ---');
console.log((await tabPanel.innerText().catch(() => 'NO TABPANEL')).slice(0, 900));
await shot('owner-ticketing');

// ---- Persona B: attendee on the event page
const side = await context.newPage();
await side.goto(BASE + '/logout');
await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
await side.close();
await uiLogin(attendee.email, attendee.password);
await gotoReady(event.path);
const region = page.getByRole('region', { name: 'Ticket Options' });
await region.waitFor({ timeout: 15000 });
console.log('--- Ticket Options text ---');
console.log((await region.innerText()).slice(0, 1200));
const optionsHeading = vis(page.getByRole('heading', { name: 'Ticket Options' }));
console.log('attendee: Ticket Options heading y =', (await optionsHeading.boundingBox())?.y);
for (const name of ['Early bird', 'Pay what you can', 'Volunteers']) {
	await vis(page.getByRole('heading', { name })).waitFor({ timeout: 10000 });
}
const location = await page.getByText('Location TBD').count();
console.log('attendee: three tiers visible; "Location TBD" count =', location);
await shot('attendee-event');

const addOne = vis(page.getByRole('button', { name: 'Add one Pay what you can' }));
await addOne.waitFor({ timeout: 10000 });
await addOne.scrollIntoViewIfNeeded();
await addOne.click();
const cartBar = page.getByRole('region', { name: 'Cart summary' });
await cartBar.waitFor({ timeout: 10000 });
console.log('cart bar:', (await cartBar.innerText()).replace(/\s+/g, ' ').slice(0, 200));
const buy = cartBar.getByRole('button', { name: 'Buy' });
await buy.waitFor({ timeout: 10000 });
await shot('attendee-cart');
await buy.click();
const dialog = page.getByRole('dialog');
await dialog.getByRole('heading', { name: 'Checkout' }).waitFor({ timeout: 10000 });
console.log('--- Checkout sheet text ---');
console.log((await dialog.innerText()).slice(0, 900));
const amount = dialog.locator('input[id$="-pwyc-amount"]');
await amount.waitFor({ timeout: 10000 });
await amount.fill('15');
console.log('checkout: amount typed =', await amount.inputValue());
const reserve = dialog.getByRole('button', { name: 'Reserve' });
await reserve.waitFor({ timeout: 10000 });
console.log('checkout: Reserve enabled =', await reserve.isEnabled());
await shot('attendee-checkout');
await reserve.click();
const qr = page.locator('img[alt="Ticket QR Code"]');
await qr.waitFor({ timeout: 20000 });
console.log('after reserve: QR visible on event page modal OK');
const modal = page.getByRole('dialog');
console.log('--- ticket modal text ---');
console.log((await modal.innerText()).replace(/\n+/g, ' | ').slice(0, 700));
console.log('modal wallet buttons: apple', await modal.getByRole('button', { name: 'Add to Apple Wallet' }).count(),
	'google', await modal.getByRole('button', { name: 'Add to Google Wallet' }).count(),
	'links apple', await modal.getByRole('link', { name: 'Add to Apple Wallet' }).count());
await shot('attendee-modal');

// ---- dashboard tickets
await gotoReady('/dashboard/tickets');
await vis(page.getByRole('heading', { name: 'My Tickets' })).waitFor({ timeout: 15000 });
await vis(page.getByText('Autumn Session: Quiet Songs')).waitFor({ timeout: 15000 });
console.log('dashboard: ticket card for the event visible');
const appleAll = page.locator('[aria-label="Add to Apple Wallet"]');
const googleAll = page.locator('[aria-label="Add to Google Wallet"]');
console.log('dashboard wallet: apple', await appleAll.count(), 'google', await googleAll.count());
const view = vis(page.getByRole('button', { name: 'View ticket and QR code' }));
await view.waitFor({ timeout: 10000 });
const viewBox = await view.boundingBox();
console.log('dashboard: View Ticket button at', viewBox);
console.log('--- dashboard card text ---');
console.log((await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 700));
await shot('dashboard');
await view.click();
await page.locator('img[alt="Ticket QR Code"]').waitFor({ timeout: 20000 });
const dModal = page.getByRole('dialog');
console.log('dashboard modal wallet: apple', await dModal.locator('[aria-label="Add to Apple Wallet"]').count(),
	'google', await dModal.locator('[aria-label="Add to Google Wallet"]').count());
const qrBox = await page.locator('img[alt="Ticket QR Code"]').boundingBox();
console.log('dashboard modal: QR box', qrBox);
await shot('dashboard-modal');

await browser.close();
console.log('PROBE PASSED');
