// Probe for Episode 16 · "When plans change". Needs the Stripe test stack
// (STRIPE_* in .env, `stripe listen` forwarding to :8000). Arranges a dressed,
// Stripe-connected club with one ticketed event and a card-paid "Standard"
// tier (no refund policy yet), two paid attendees, then walks:
//
//   owner    : Ticketing tab → Edit the Standard tier → "Cancellation &
//              refunds": toggle on, deadline 24 h, brackets 100 % ≥ 168 h and
//              50 % ≥ 48 h → save → verify via API
//   attendee : event page → add Standard → Buy → the checkout sheet shows the
//              cancellation terms (FE #931) → (pay by card OFF camera on a side
//              page) → dashboard → View Ticket → Cancel ticket → the dialog
//              quotes the refund → confirm → toast
//   owner    : the event's ticket list → the cancelled row → the edit page's
//              "Cancel event" dialog with the refund preview → Keep event
//
//   MAILPIT_URL=http://localhost:8125 SHOT_DIR=<dir> node probes/ep-when-plans-change.mjs
import { chromium } from 'playwright';
import {
	api,
	createDressedOrg,
	createEvent,
	createTier,
	deleteDefaultTier,
	markStripeConnected,
	pickFreeOrgName,
	registerVerifiedUser,
	setOrgBilling
} from '../demos/arrange-lib.mjs';
import { buyTicketByCard } from '../demos/stripe-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SHOT = process.env.SHOT_DIR || '';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---- Arrange -------------------------------------------------------------
const orgName = await pickFreeOrgName([
	'Lichtspiel Film Club',
	'Kinoklub Ottakring',
	'Nachtvorstellung Film Club',
	'Projektor Film Club',
	'Zelluloid Film Club'
]);
const org = await createDressedOrg({
	name: orgName,
	description:
		'A film club in a former corner shop in Ottakring. One screening a month, 35 millimetre when we can get it, and a discussion afterwards that usually outlasts the film. Run by five volunteers since 2016.',
	address: 'Thaliastraße 46, 1160 Vienna, Austria'
});
log('org', org.slug, '| owner', org.owner.email);
const connected = await markStripeConnected(org.slug);
if (!connected) throw new Error('org is not Stripe-connected — check CONNECTED_TEST_STRIPE_ID in .env and the containers');
await setOrgBilling(org.slug, org.owner.token, {
	billing_name: `${orgName} (Verein)`,
	billing_address: 'Thaliastraße 46, 1160 Vienna, Austria',
	billing_email: org.owner.email
});
const event = await createEvent(org.slug, org.owner.token, {
	name: 'Double Feature: Wings of Desire & Paris, Texas',
	description:
		'Two Wim Wenders films back to back, with a short break for coffee and cake between them. Doors at six, first film at half past. Numbered seats are not a thing here — come early for the good chairs.',
	address: 'Thaliastraße 46, 1160 Vienna, Austria',
	max_attendees: 40,
	// The checkout sheet only opens for multi-tier carts or when names are
	// required — and the sheet is where the cancellation terms live (FE #931).
	require_ticket_names: true
});
await deleteDefaultTier(event.id, org.owner.token);
const tier = await createTier(event.id, org.owner.token, {
	name: 'Standard',
	description: 'One seat for both films, coffee and cake included.',
	payment_method: 'online',
	price: '18.00',
	total_quantity: 40
});
log('tier', tier.id, tier.payment_method, tier.price, '| allow_user_cancellation =', tier.allow_user_cancellation);
const buyer = await registerVerifiedUser('buyer', 'Mara', 'Lindqvist', { emailLocal: 'mara.lindqvist' });
const others = await Promise.all([
	registerVerifiedUser('a1', 'Tobias', 'Reiter', { emailLocal: 'tobias.reiter' }),
	registerVerifiedUser('a2', 'Ines', 'Kovač', { emailLocal: 'ines.kovac' })
]);
log('arrange: OK', event.path, '| buyer', buyer.email);

// ---- Browser --------------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const shot = async (name) => SHOT && page.screenshot({ path: `${SHOT}/${name}.png` });
const vis = (loc) => loc.filter({ visible: true }).first();
const text = async (loc, n = 900) => (await loc.innerText()).replace(/\s*\n\s*/g, ' | ').slice(0, n);

// Two other attendees pay by card before anyone is on camera (side pages).
for (const u of others) {
	const tk = await buyTicketByCard(context, u, event.id, tier.id);
	log('pre-paid', u.email, '→', tk.status);
}

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

// ---- Persona A: owner sets the refund policy on the Standard tier ----------
await uiLogin(org.owner.email, org.owner.password);
const adminPath = `/org/${org.slug}/admin/events/${event.id}/edit?tab=ticketing`;
await gotoReady(adminPath);
await vis(page.getByRole('heading', { name: 'Ticket Tiers' })).waitFor({ timeout: 15000 });
const standardHeading = vis(page.getByRole('heading', { name: 'Standard' }));
await standardHeading.waitFor({ timeout: 10000 });
// The tier card: walk up to the card element and list its buttons.
const card = standardHeading.locator('xpath=ancestor::*[self::article or self::li or contains(@class,"rounded")][1]');
log('owner: tier card text =', await text(card, 400));
const cardButtons = await card.getByRole('button').allInnerTexts();
log('owner: tier card buttons =', JSON.stringify(cardButtons));
await shot('a1-ticketing-tab');
const editBtn = vis(card.getByRole('button', { name: /Edit/ }));
if (!(await editBtn.isVisible().catch(() => false))) throw new Error('no Edit button on the tier card');
await editBtn.click();
const form = page.getByRole('dialog');
await form.waitFor({ timeout: 10000 });
log('owner: dialog heading =', await form.getByRole('heading').first().innerText());
const sectionTitle = form.getByText('Cancellation & refunds', { exact: true });
await sectionTitle.waitFor({ timeout: 10000 });
await sectionTitle.evaluate((el) => el.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(300);
log('owner: refunds section box =', await sectionTitle.boundingBox());
await shot('a2-refunds-section');
const allowToggle = form.getByLabel('Allow attendees to cancel their tickets');
log('owner: toggle count =', await allowToggle.count(), '| role/tag:', await allowToggle.first().evaluate((el) => `${el.tagName} role=${el.getAttribute('role')} checked=${el.getAttribute('aria-checked') ?? el.checked}`));
await allowToggle.first().click();
await page.waitForTimeout(400);
// Deadline and bracket times are DurationInputs that DISPLAY in days by
// default and store hours — so "1" here is 24 h, "7" is 168 h, "2" is 48 h.
async function unitOf(input) {
	// DurationInput = number input + a unit picker button right after it.
	return (await input.locator('xpath=following::button[1]').innerText().catch(() => '')).trim();
}
const deadline = form.locator('#cancellation-deadline-hours');
await deadline.waitFor({ timeout: 10000 });
await deadline.click();
await deadline.fill('');
await deadline.pressSequentially('1', { delay: 60 });
log('owner: deadline display =', await deadline.inputValue());
const bracketsTitle = form.getByText('Refund brackets', { exact: true });
await bracketsTitle.waitFor({ timeout: 10000 });
await bracketsTitle.evaluate((el) => el.scrollIntoView({ block: 'center' }));
log('owner: empty-state buttons =', JSON.stringify(await form.getByRole('button', { name: /bracket|100% until/ }).allInnerTexts()));
await shot('a3-editor-before');
log('owner: deadline unit =', await unitOf(deadline));
async function setBracket(index, hours, pct) {
	const h = form.locator(`#refund-hours-${index}`);
	const p = form.locator(`#refund-pct-${index}`);
	await h.waitFor({ timeout: 8000 });
	// The unit picker (shadcn Select) is labelled "<field label> unit". A fresh
	// row may show one unit and convert with another (FE bug?), so pick Hours
	// explicitly before typing and log what the trigger said before/after.
	const trigger = h.locator('xpath=following::button[1]');
	const triggerCount = await trigger.evaluate((el) => `${el.tagName} role=${el.getAttribute('role')} aria-label=${el.getAttribute('aria-label')} labelledby=${el.getAttribute('aria-labelledby')}`).catch(() => 'n/a');
	const before = await trigger.innerText().catch(() => 'n/a');
	if (!/hour/i.test(before)) {
		await trigger.click();
		const opt = page.getByRole('option', { name: 'Hours' });
		const seen = await opt.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
		log('owner: unit options =', seen ? JSON.stringify(await page.getByRole('option').allInnerTexts()) : 'NO options rendered; roles present: ' + JSON.stringify(await page.locator('[role]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('role')))])));
		if (seen) await opt.click();
		else await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	}
	await h.click();
	await h.fill('');
	await h.pressSequentially(String(hours), { delay: 50 });
	await p.click();
	await p.fill('');
	await p.pressSequentially(String(pct), { delay: 50 });
	log(`owner: bracket ${index + 1}: triggers=${triggerCount} unit before="${before}" after="${await trigger.innerText().catch(() => 'n/a')}" typed ${await h.inputValue()} → ${await p.inputValue()} %`);
}
const addBracket = form.getByRole('button', { name: 'Add another bracket' });
await addBracket.first().click();
await page.waitForTimeout(300);
await setBracket(0, 168, 100);
await addBracket.first().click();
await page.waitForTimeout(300);
await setBracket(1, 48, 50);
log('owner: summary lines =', JSON.stringify(await form.getByText(/≥ .*h before/).allInnerTexts()));
await shot('a4-editor-filled');
const saveButtons = await form.getByRole('button').allInnerTexts();
log('owner: dialog buttons =', JSON.stringify(saveButtons));
const save = form.getByRole('button', { name: /Save|Update/ }).last();
log('owner: save button =', await save.innerText(), '| enabled =', await save.isEnabled());
await save.click();
await form.waitFor({ state: 'hidden', timeout: 15000 });
const tiers = await api(`/api/event-admin/${event.id}/ticket-tiers`, { token: org.owner.token });
const saved = (tiers.results ?? tiers.items ?? tiers).find((t) => t.id === tier.id);
log('verify: policy via API =', JSON.stringify({ allow: saved.allow_user_cancellation, deadline: saved.cancellation_deadline_hours, policy: saved.refund_policy }));
if (!saved.allow_user_cancellation) throw new Error('allow_user_cancellation did not stick');
if (saved.cancellation_deadline_hours !== 24) throw new Error('deadline did not stick: ' + saved.cancellation_deadline_hours);
const hrs = (saved.refund_policy?.tiers ?? []).map((t) => Number(t.hours_before_event));
if (hrs.join(',') !== '168,48') throw new Error('brackets expected 168,48 h, got ' + hrs.join(','));
await shot('a5-saved');

// ---- Persona B: the attendee sees the terms, pays (off camera), cancels -----
await switchUser(buyer.email, buyer.password);
await gotoReady(event.path);
const region = page.getByRole('region', { name: 'Ticket Options' });
await region.waitFor({ timeout: 15000 });
log('buyer: ticket options =', await text(region, 500));
log('buyer: demo test-card hint boxes =', await page.locator('.bg-info\\/10.border-info\\/30').count());
const addOne = vis(page.getByRole('button', { name: 'Add one Standard' }));
await addOne.scrollIntoViewIfNeeded();
await addOne.click();
const cartBar = page.getByRole('region', { name: 'Cart summary' });
await cartBar.waitFor({ timeout: 10000 });
await cartBar.getByRole('button', { name: 'Buy' }).click();
const sheet = page.getByRole('dialog');
await sheet.waitFor({ timeout: 10000 });
log('buyer: sheet text =', await text(sheet, 1400));
const policyTitle = sheet.getByText('Cancellation policy', { exact: true });
log('buyer: "Cancellation policy" in sheet =', await policyTitle.count(), '| box =', await policyTitle.first().boundingBox().catch(() => null));
if ((await policyTitle.count()) === 0) throw new Error('cancellation terms not shown in the checkout sheet — is the frontend v2.12.3+?');
const nameField = sheet.getByRole('textbox').first();
log('buyer: first textbox label =', await nameField.getAttribute('aria-label'), await nameField.getAttribute('placeholder'), await nameField.getAttribute('id'));
await shot('b1-sheet-terms');
await page.keyboard.press('Escape');
await sheet.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => undefined);

// Pay by card on a side page — never on camera.
const ticket = await buyTicketByCard(context, buyer, event.id, tier.id);
log('buyer: paid; ticket', ticket.id, ticket.status);

await gotoReady('/dashboard/tickets');
const myCard = page.locator('article, li, div').filter({ hasText: event.name }).filter({ hasText: /Active/i }).first();
await myCard.waitFor({ timeout: 20000 });
await shot('b2-dashboard-active');
await vis(myCard.getByRole('button', { name: 'View Ticket' })).click();
const modal = page.getByRole('dialog', { name: 'Your Ticket', exact: true });
await modal.waitFor({ timeout: 15000 });
log('buyer: modal text =', await text(modal, 900));
const cancelBtn = modal.getByRole('button', { name: 'Cancel ticket' });
await cancelBtn.waitFor({ timeout: 10000 });
log('buyer: Cancel ticket button box =', await cancelBtn.boundingBox());
await shot('b3-ticket-modal');
await cancelBtn.click();
const cancelDialog = page.getByRole('dialog', { name: 'Cancel your ticket' });
await cancelDialog.waitFor({ timeout: 15000 });
const summary = cancelDialog.getByTestId('refund-summary');
await summary.getByText("You'll receive").waitFor({ timeout: 20000 });
log('buyer: cancel dialog text =', await text(cancelDialog, 1200));
await shot('b4-cancel-dialog');
await cancelDialog.getByLabel('Reason (optional)').pressSequentially("Can't make it that weekend after all — sorry!", { delay: 10 });
await cancelDialog.getByRole('button', { name: 'Confirm cancellation' }).click();
await page.getByText('Ticket cancelled').first().waitFor({ timeout: 30000 });
log('buyer: toast "Ticket cancelled" visible');
await page.waitForTimeout(1500);
await shot('b5-after-cancel');
log('buyer: page shows Cancelled =', await page.getByText(/Cancelled/i).count(), '| refund text =', JSON.stringify(await page.getByText(/refund/i).allInnerTexts()).slice(0, 300));
const mine = await api('/api/dashboard/tickets?page_size=50', { token: buyer.token });
const mineT = (mine.results ?? mine).find((x) => x.id === ticket.id);
log('verify: ticket via API =', JSON.stringify({ status: mineT?.status, refund_status: mineT?.refund_status, refund_amount: mineT?.refund_amount, source: mineT?.cancellation_source }));
if (mineT?.status !== 'cancelled') throw new Error('ticket not cancelled');

// ---- Persona A again: the ticket list and the Cancel event dialog ----------
await switchUser(org.owner.email, org.owner.password);
const ticketsPath = `/org/${org.slug}/admin/events/${event.id}/tickets`;
await gotoReady(ticketsPath);
await vis(page.getByRole('heading', { name: 'Manage Tickets' })).waitFor({ timeout: 15000 });
const rows = page.locator('table tbody tr').filter({ visible: true });
await rows.first().waitFor({ timeout: 15000 });
log('owner: rows =', await rows.count());
for (let i = 0; i < (await rows.count()); i++) log('  row', i, await text(rows.nth(i), 260));
const buyerRow = rows.filter({ hasText: 'Mara Lindqvist' }).first();
const buyerRowVisible = await buyerRow.isVisible().catch(() => false);
log('owner: cancelled row visible in default list =', buyerRowVisible);
if (!buyerRowVisible) {
	const filters = await page.locator('main').getByRole('combobox').allInnerTexts();
	log('owner: filters/comboboxes =', JSON.stringify(filters));
	const statusFilter = page.locator('main select').first();
	if ((await statusFilter.count()) > 0) {
		log('owner: select options =', JSON.stringify(await statusFilter.locator('option').allInnerTexts()));
		await statusFilter.selectOption({ label: /Cancelled/i }).catch(() => statusFilter.selectOption('cancelled'));
		await page.waitForTimeout(1200);
		log('owner: after filter, buyer row visible =', await buyerRow.isVisible().catch(() => false), await text(buyerRow, 260).catch(() => ''));
	}
}
log('owner: stats =', await text(page.locator('main .grid').first(), 400).catch(() => 'n/a'));
await shot('c1-ticket-list');

await gotoReady(`/org/${org.slug}/admin/events/${event.id}/edit`);
const cancelEventBtn = vis(page.getByRole('button', { name: 'Cancel event' }));
await cancelEventBtn.waitFor({ timeout: 15000 });
log('owner: Cancel event button box =', await cancelEventBtn.boundingBox());
await cancelEventBtn.evaluate((el) => el.scrollIntoView({ block: 'center' }));
await shot('c2-edit-page');
await cancelEventBtn.click();
const cancelEventDialog = page.getByRole('dialog');
await cancelEventDialog.getByRole('heading', { name: 'Cancel this event' }).waitFor({ timeout: 10000 });
await page.waitForTimeout(2500); // refund preview loads
log('owner: cancel-event dialog =', await text(cancelEventDialog, 1400));
await shot('c3-cancel-event-dialog');
const keep = cancelEventDialog.getByRole('button', { name: 'Keep event' });
await keep.click();
await cancelEventDialog.waitFor({ state: 'hidden', timeout: 8000 });
const ev = await api(`/api/events/${org.slug}/event/${event.slug}`);
log('verify: event status still =', ev.status);
if (ev.status === 'cancelled') throw new Error('event got cancelled by the probe');

await browser.close();
console.log('PROBE PASSED');
