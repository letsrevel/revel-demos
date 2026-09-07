// Probe for Episode 15 · "Selling a ticket, start to finish". Arranges a
// dressed org + open ticketed event with two tiers (free Volunteers, paid At
// the door), then walks every selector the episode touches:
//
//   owner   : Ticketing tab → "+ Add Another Tier" → the tier form, filled ON
//             CAMERA (name, offline payment, price, instructions, quantity)
//   buyer   : event page → Early bird → cart → checkout → Reserve → the
//             pending ticket (modal + dashboard card with the instructions)
//   owner   : the event's ticket list → the Pending row → Confirm Payment →
//             the row reads Active and the counters follow
//
// Verifies the arranged and the on-camera state through the API at each step.
//
//   SHOT_DIR=<dir> node probes/ep-selling-a-ticket.mjs
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
	name: 'Kettle Lane Folk Club',
	description:
		'A folk club in the back room of a pub in Mariahilf. Fiddles, a squeezebox, and whoever brought a song. Every second Thursday since 2014, run by volunteers.',
	address: 'Stumpergasse 12, 1060 Vienna, Austria'
});
const event = await createEvent(org.slug, org.owner.token, {
	name: 'Harvest Night: Songs from the Back Room',
	description:
		'Our autumn session. Three short sets, then the floor is open. Bring an instrument or just your ears. Doors at seven, first tune at half past.',
	address: 'Stumpergasse 12, 1060 Vienna, Austria',
	max_attendees: 60,
	// The checkout sheet otherwise asks for a holder name before "Reserve"
	// enables — one more field to type on camera, for no story.
	require_ticket_names: false
});
await deleteDefaultTier(event.id, org.owner.token);
await createTier(event.id, org.owner.token, {
	name: 'At the door',
	description: 'Pay cash at the door when you arrive. Fifteen euros, no card needed.',
	payment_method: 'at_the_door',
	price: '15.00',
	total_quantity: 30
});
await createTier(event.id, org.owner.token, {
	name: 'Volunteers',
	description: 'Free entry for the door and bar crew. Show up an hour early.',
	payment_method: 'free',
	price: '0.00',
	total_quantity: 5
});
const buyer = await registerVerifiedUser('buyer', 'Jonas', 'Feldmann', { emailLocal: 'jonas.feldmann' });
console.log('arrange: OK', event.path, 'event id', event.id);
console.log('owner', org.owner.email, '| buyer', buyer.email);

const listTiers = async () => {
	const res = await api(`/api/event-admin/${event.id}/ticket-tiers`, { token: org.owner.token });
	return res.results ?? res.items ?? res;
};
const before = await listTiers();
if (before.length !== 2) throw new Error(`expected 2 arranged tiers, got ${before.length}`);
console.log('verify: 2 arranged tiers:', before.map((t) => `${t.name} (${t.payment_method})`).join(', '));

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
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
	await page.waitForTimeout(800);
}
async function switchUser(email, password) {
	const side = await context.newPage();
	await side.goto(BASE + '/logout');
	await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
	await side.close();
	await uiLogin(email, password);
}
async function gotoReady(path) {
	await page.goto(BASE + path);
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
	await page.waitForLoadState('networkidle').catch(() => undefined);
}
const vis = (loc) => loc.filter({ visible: true }).first();

// ---- Persona A: owner creates the Early bird tier on the Ticketing tab ----
await uiLogin(org.owner.email, org.owner.password);
const adminPath = `/org/${org.slug}/admin/events/${event.id}/edit?tab=ticketing`;
await gotoReady(adminPath);
await vis(page.getByRole('heading', { name: 'Ticket Tiers' })).waitFor({ timeout: 15000 });
console.log('owner: Ticket Tiers heading OK at', adminPath);
for (const name of ['At the door', 'Volunteers']) {
	await vis(page.getByRole('heading', { name })).waitFor({ timeout: 10000 });
}
const addTier = vis(page.getByRole('button', { name: /Add Another Tier/ }));
await addTier.waitFor({ timeout: 10000 });
console.log('owner: add-tier button at', await addTier.boundingBox());
await shot('a1-ticketing-tab');
await addTier.scrollIntoViewIfNeeded();
await addTier.click();
const form = page.getByRole('dialog');
await form.getByRole('heading', { name: 'Create Ticket Tier' }).waitFor({ timeout: 10000 });
console.log('owner: tier form open');

const nameInput = form.locator('#tier-name');
await nameInput.waitFor({ timeout: 10000 });
await nameInput.pressSequentially('Early bird', { delay: 40 });
const desc = form.getByRole('textbox', { name: /Description/ });
await desc.waitFor({ timeout: 10000 });
await desc.click();
await desc.pressSequentially('The first twenty seats, at a friendlier price.', { delay: 8 });

// The payment-method picker is a native <select>; its popup is an OS widget
// the recorder never sees. Expand it inline so all the options render in-page.
const method = form.locator('#payment-method');
const optionText = await method.locator('option').allInnerTexts();
console.log('owner: payment methods:', optionText.map((s) => s.trim()).join(' | '));
const onlineDisabled = await method.locator('option[value="online"]').isDisabled();
console.log('owner: online option disabled =', onlineDisabled);
await method.evaluate((el) => {
	el.size = 4;
	el.style.height = 'auto';
});
await page.waitForTimeout(300);
const expandedBox = await method.boundingBox();
console.log('owner: expanded picker box', expandedBox);
await shot('a2-method-picker-open');
await method.selectOption('offline');
await method.evaluate((el) => {
	el.size = 1;
	el.style.height = '';
});
console.log('owner: payment method =', await method.inputValue());

// Price type — same trick for the fixed / pay-what-you-can choice.
const priceType = form.locator('#price-type');
await priceType.waitFor({ timeout: 10000 });
console.log('owner: price types:', (await priceType.locator('option').allInnerTexts()).join(' | '));
await priceType.evaluate((el) => {
	el.size = 2;
	el.style.height = 'auto';
});
await page.waitForTimeout(300);
await shot('a3-price-type-open');
await priceType.selectOption('fixed');
await priceType.evaluate((el) => {
	el.size = 1;
	el.style.height = '';
});

const price = form.locator('#price');
await price.waitFor({ timeout: 10000 });
await price.click();
await price.fill('');
await price.pressSequentially('12', { delay: 80 });
console.log('owner: price =', await price.inputValue());

const instructions = form.getByRole('textbox', { name: /Payment Instructions/ });
await instructions.waitFor({ timeout: 10000 });
console.log('owner: instructions textbox box', await instructions.boundingBox());
await instructions.click();
const INSTRUCTIONS =
	'Bank transfer to Kettle Lane Folk Club, IBAN AT61 1904 3002 3457 3201, reference your name. We confirm within a day.';
await instructions.pressSequentially(INSTRUCTIONS, { delay: 8 });
await shot('a4-instructions-typed');

const qty = form.locator('#total-quantity');
await qty.scrollIntoViewIfNeeded();
await qty.click();
await qty.fill('');
await qty.pressSequentially('20', { delay: 80 });
console.log('owner: quantity =', await qty.inputValue());
await shot('a5-quantity');

const create = form.getByRole('button', { name: 'Create Tier' });
await create.scrollIntoViewIfNeeded();
console.log('owner: Create Tier enabled =', await create.isEnabled());
await create.click();
await form.waitFor({ state: 'hidden', timeout: 15000 });
await vis(page.getByRole('heading', { name: 'Early bird' })).waitFor({ timeout: 15000 });
console.log('owner: Early bird card visible after create');
await shot('a6-tier-created');

const after = await listTiers();
const early = after.find((t) => t.name === 'Early bird');
if (!early) throw new Error('Early bird tier did not persist: ' + after.map((t) => t.name).join(', '));
console.log(
	`verify: Early bird | ${early.payment_method} | ${early.price_type} | price ${early.price} | qty ${early.total_quantity} | instr "${(early.manual_payment_instructions ?? '').slice(0, 40)}…"`
);
if (early.payment_method !== 'offline') throw new Error('payment_method did not stick');
if (Number(early.price) !== 12) throw new Error('price did not stick: ' + early.price);
if (early.total_quantity !== 20) throw new Error('quantity did not stick: ' + early.total_quantity);
if (!(early.manual_payment_instructions ?? '').includes('IBAN')) throw new Error('instructions did not stick');
console.log('verify: on-camera tier OK');

// ---- Persona B: the buyer reserves Early bird -------------------------------
await switchUser(buyer.email, buyer.password);
await gotoReady(event.path);
const region = page.getByRole('region', { name: 'Ticket Options' });
await region.waitFor({ timeout: 15000 });
console.log('--- Ticket Options text ---');
console.log((await region.innerText()).replace(/\n+/g, ' | ').slice(0, 900));
console.log('buyer: "Location TBD" count =', await page.getByText('Location TBD').count());
const optionsHeading = vis(page.getByRole('heading', { name: 'Ticket Options' }));
console.log('buyer: Ticket Options heading y =', (await optionsHeading.boundingBox())?.y);
const earlyCard = vis(page.getByRole('heading', { name: 'Early bird' }));
await earlyCard.waitFor({ timeout: 10000 });
console.log('buyer: Early bird heading y =', (await earlyCard.boundingBox())?.y);
await shot('b1-event-page');

const addOne = vis(page.getByRole('button', { name: 'Add one Early bird' }));
await addOne.waitFor({ timeout: 10000 });
await addOne.scrollIntoViewIfNeeded();
await addOne.click();
const cartBar = page.getByRole('region', { name: 'Cart summary' });
await cartBar.waitFor({ timeout: 10000 });
console.log('cart bar:', (await cartBar.innerText()).replace(/\s+/g, ' ').slice(0, 200));
const buy = cartBar.getByRole('button', { name: 'Buy' });
await buy.waitFor({ timeout: 10000 });
await shot('b2-cart');
await buy.click();
// A single fixed-price tier on a no-names event skips the checkout sheet
// (direct checkout) — but tolerate the sheet in case the rules change.
const sheetReserve = page.getByRole('dialog').getByRole('button', { name: 'Reserve' });
const sawSheet = await sheetReserve.waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
console.log('buyer: checkout sheet shown =', sawSheet);
if (sawSheet) {
	console.log('--- Checkout sheet text ---');
	console.log((await page.getByRole('dialog').innerText()).replace(/\n+/g, ' | ').slice(0, 600));
	await sheetReserve.click();
}
// The ticket modal opens by itself once the reservation lands.
const modal = page.getByRole('dialog');
await modal.getByText('Payment Instructions:').first().waitFor({ timeout: 20000 });
console.log('--- ticket modal text ---');
console.log((await modal.innerText()).replace(/\n+/g, ' | ').slice(0, 1200));
console.log(
	'modal: Pending badge count =',
	await modal.getByText('Pending', { exact: true }).count(),
	'| IBAN visible =',
	await modal.getByText(/IBAN/).count(),
	'| QR count =',
	await modal.locator('img[alt="Ticket QR Code"]').count()
);
const modalInstrBox = await modal.getByText('Payment Instructions:').first().boundingBox();
console.log('modal: instructions box at', modalInstrBox);
await shot('b4-ticket-modal');

// The dashboard card — does it show the pending banner + instructions inline?
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await gotoReady('/dashboard/tickets');
await vis(page.getByRole('heading', { name: 'My Tickets' })).waitFor({ timeout: 15000 });
await vis(page.getByText('Harvest Night: Songs from the Back Room')).waitFor({ timeout: 15000 });
console.log('--- dashboard main text ---');
console.log((await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 1200));
console.log(
	'dashboard: Pending badge count =',
	await page.locator('main').getByText('Pending', { exact: true }).count(),
	'| IBAN count =',
	await page.locator('main').getByText(/IBAN/).count()
);
const dashInstr = page.locator('main').getByText('Payment Instructions:').first();
console.log('dashboard: instructions box at', await dashInstr.boundingBox().catch(() => null));
await shot('b5-dashboard');

const myTickets = await api('/api/me/tickets?page_size=20', { token: buyer.token }).catch(() => null);
const mine = (myTickets?.results ?? []).find((t) => t.event?.id === event.id || t.event === event.id);
console.log('verify: buyer ticket status via API =', mine?.status ?? JSON.stringify(myTickets).slice(0, 200));

// ---- Persona A again: confirm the payment on the event's ticket list -------
await switchUser(org.owner.email, org.owner.password);
const ticketsPath = `/org/${org.slug}/admin/events/${event.id}/tickets`;
await gotoReady(ticketsPath);
await vis(page.getByRole('heading', { name: 'Manage Tickets' })).waitFor({ timeout: 15000 });
console.log('owner: Manage Tickets heading OK at', ticketsPath);
const statsText = async () => {
	const cards = page.locator('main .grid > div');
	const out = [];
	for (let i = 0; i < (await cards.count()); i++) out.push((await cards.nth(i).innerText()).replace(/\s+/g, ' '));
	return out.join(' || ');
};
console.log('owner: stats before =', await statsText());
const row = page.locator('table tbody tr').filter({ hasText: 'Jonas Feldmann' }).first();
await row.waitFor({ timeout: 15000 });
console.log('owner: row text =', (await row.innerText()).replace(/\s+/g, ' ').slice(0, 300));
console.log('owner: row y =', (await row.boundingBox())?.y);
const confirmBtn = row.getByRole('button', { name: 'Confirm Payment' });
await confirmBtn.waitFor({ timeout: 10000 });
console.log('owner: Confirm Payment button at', await confirmBtn.boundingBox());
await shot('c1-ticket-list-pending');
await confirmBtn.click();
const confirmDialog = page.getByRole('dialog');
await confirmDialog.getByRole('heading', { name: 'Confirm Payment' }).waitFor({ timeout: 10000 });
console.log('--- confirm dialog text ---');
console.log((await confirmDialog.innerText()).replace(/\n+/g, ' | ').slice(0, 400));
await shot('c2-confirm-dialog');
await confirmDialog.getByRole('button', { name: 'Confirm Payment' }).click();
await confirmDialog.waitFor({ state: 'hidden', timeout: 15000 });
await row.getByText('Active', { exact: true }).waitFor({ timeout: 15000 });
console.log('owner: row now reads Active; row text =', (await row.innerText()).replace(/\s+/g, ' ').slice(0, 300));
console.log('owner: stats after =', await statsText());
await shot('c3-ticket-list-active');

const adminTickets = await api(`/api/event-admin/${event.id}/tickets`, { token: org.owner.token });
const t = (adminTickets.results ?? []).find((x) => x.user?.email === buyer.email);
console.log('verify: ticket status via API =', t?.status);
if (t?.status !== 'active') throw new Error('ticket did not flip to active: ' + JSON.stringify(t).slice(0, 300));

await browser.close();
console.log('PROBE PASSED');
