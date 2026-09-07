// Probe for ep-publish-event: walks the create-event form, the post-creation
// details, the draft → published flow on the edit page, and the public page.
//   node probes/ep-publish-event.mjs
import { chromium } from 'playwright';
import { api, createDressedOrg } from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SHOTS =
	process.env.SHOTS ||
	'/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-publish-event';

const ORG = {
	name: 'Neubau Listening Club',
	description:
		'A small club that meets twice a month to listen to one record, start to finish, with the lights down. No phones, no skipping. Run by a handful of friends in the seventh district.',
	address: 'Westbahnstraße 27, 1070 Vienna, Austria'
};
const EVENT_NAME = 'Autumn Listening Night';
const EVENT_ADDRESS = 'Westbahnstraße 27, 1070 Vienna, Austria';
const EVENT_DESCRIPTION = 'One record, start to finish, on the good speakers. Doors at seven, quiet by half past.';

const org = await createDressedOrg(ORG);
// The form's City field is seeded from the organization's city; without it the
// Save after creation fails validation ("city required"). Vienna is id 1.
const cities = await api('/api/cities/?search=Vienna&page_size=1');
const vienna = cities.results?.[0];
if (!vienna) throw new Error('no Vienna in /api/cities');
await api(`/api/organization-admin/${org.slug}`, {
	method: 'PUT',
	token: org.owner.token,
	body: {
		visibility: 'public',
		accept_membership_requests: true,
		description: ORG.description,
		address: ORG.address,
		city_id: vienna.id
	}
});
const orgCheck = await api(`/api/organization-admin/${org.slug}`, { token: org.owner.token });
console.log('arrange: org', org.slug, 'city:', orgCheck.city?.name ?? orgCheck.city_id ?? '(none)');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
page.on('dialog', (d) => {
	console.log('dialog:', d.type(), JSON.stringify(d.message()));
	d.accept();
});
const hydrated = () => page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
const bell = () => page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
const shot = (n) => page.screenshot({ path: `${SHOTS}/probe-${n}.png` });

async function uiLogin(email, password) {
	await page.goto(BASE + '/login');
	await hydrated();
	const reveal = page.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
	await page.getByLabel('Email address').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
}

await uiLogin(org.owner.email, org.owner.password);
await bell();
console.log('login OK');

// ---- 1. The form.
await page.goto(`${BASE}/org/${org.slug}/admin/events/new`);
await hydrated();
await page.waitForLoadState('networkidle').catch(() => undefined);
await page.locator('#event-name').waitFor({ timeout: 20000 });
await shot('1-form');
const t = Date.now();
const start = new Date(t + 10 * 24 * 3600 * 1000);
start.setHours(19, 30, 0, 0);
const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const end = new Date(start.getTime() + 3 * 3600 * 1000);
await page.locator('#event-name').pressSequentially(EVENT_NAME, { delay: 40 });
await page.locator('#event-start').fill(local(start));
await page.locator('#event-end').fill(local(end));
console.log('start value:', await page.locator('#event-start').inputValue(), 'end:', await page.locator('#event-end').inputValue());
const pub = page.locator('input[type=radio][name="visibility"][value="public"]');
console.log('visibility radios:', await page.locator('input[type=radio][name="visibility"]').count());
await pub.scrollIntoViewIfNeeded();
await pub.click({ force: true });
console.log('public checked:', await pub.isChecked());
const ticket = page.getByLabel('Requires Ticket');
console.log('requires ticket count/checked:', await ticket.count(), await ticket.first().isChecked().catch(() => '?'));
const createBtn = page.getByRole('button', { name: 'Create Event', exact: true });
console.log('create button:', await createBtn.count());
await createBtn.scrollIntoViewIfNeeded();
await shot('1b-form-filled');
await createBtn.click();

// ---- 2. Post-creation: details section.
const saveBtn = page.getByRole('button', { name: 'Save', exact: true }).first();
await saveBtn.waitFor({ timeout: 20000 });
await page.waitForLoadState('networkidle').catch(() => undefined);
console.log('post-create: Save buttons', await page.getByRole('button', { name: 'Save', exact: true }).count());
await shot('2-after-create');
// Description: the Tiptap surface inside "Basic Details" (open by default).
const editor = page.locator('.markdown-editor-surface .ProseMirror[contenteditable="true"]').first();
await editor.waitFor({ timeout: 10000 });
console.log('description editor:', await editor.count(), 'placeholder text:', await editor.getAttribute('aria-label'));
await editor.scrollIntoViewIfNeeded();
await editor.click();
await editor.pressSequentially(EVENT_DESCRIPTION, { delay: 5 });
console.log('editor text:', JSON.stringify(await editor.innerText()));
await shot('2a-description');
const addAddress = page.getByRole('button', { name: 'Add Address' });
console.log('Add Address:', await addAddress.count());
await addAddress.scrollIntoViewIfNeeded();
await addAddress.click();
const cityInput = page.locator('#city-search');
console.log('city search input visible (means NO prefilled city):', await cityInput.count());
const cityText = await page.locator('text=Vienna').filter({ visible: true }).count();
console.log('Vienna shown:', cityText);
const addr = page.locator('#location-address');
await addr.waitFor({ timeout: 10000 });
await addr.fill(EVENT_ADDRESS);
await shot('2b-address');
// The capacity section is a collapsed accordion; open it first.
const capToggle = page.getByRole('button', { name: /Capacity and waitlist/ }).filter({ visible: true }).first();
console.log('capacity toggle:', await capToggle.count(), 'expanded:', await capToggle.getAttribute('aria-expanded'));
await capToggle.scrollIntoViewIfNeeded();
if ((await capToggle.getAttribute('aria-expanded')) !== 'true') await capToggle.click();
const cap = page.locator('#max-attendees');
await cap.waitFor({ timeout: 10000 });
console.log('max attendees input:', await cap.count());
await cap.scrollIntoViewIfNeeded();
await cap.fill('40');
await shot('2c-capacity');
await saveBtn.scrollIntoViewIfNeeded();
await saveBtn.click();
await page.waitForURL(/\/admin\/events\/[^/]+\/edit/, { timeout: 20000 });
await hydrated();
await page.waitForLoadState('networkidle').catch(() => undefined);
console.log('edit page:', page.url());

// ---- 3. Draft → Publish.
const draftBadge = page.getByText('Draft', { exact: true }).filter({ visible: true });
console.log('Draft badge:', await draftBadge.count());
await shot('3-draft');
const publish = page.getByRole('button', { name: 'Publish Event' });
console.log('Publish button:', await publish.count());
await publish.click();
await page.getByText('Published', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
await page.waitForLoadState('networkidle').catch(() => undefined);
console.log('Published badge visible');
await shot('4-published');

// ---- 4. Verify via API.
const eventId = page.url().match(/events\/([^/]+)\/edit/)[1];
// Authenticated: anonymous requests share one throttle bucket across every
// author probing this stack, and 429 there.
const ev = await api(`/api/events/${eventId}`, { token: org.owner.token });
const slug = ev.slug;
console.log('event slug:', slug);
const pubEv = await api(`/api/events/${org.slug}/event/${slug}`, { token: org.owner.token });
console.log('description saved:', JSON.stringify(pubEv.description));
if (!(pubEv.description || '').includes('good speakers')) throw new Error('description not saved');
console.log('public event:', { status: pubEv.status, address: pubEv.address, max: pubEv.max_attendees, start: pubEv.start, city: pubEv.city?.name, requires_ticket: pubEv.requires_ticket });
if (pubEv.status !== 'open') throw new Error('status not open');
if (pubEv.address !== EVENT_ADDRESS) throw new Error('address not saved: ' + pubEv.address);
if (pubEv.max_attendees !== 40) throw new Error('max_attendees not saved');

// ---- 5. Public page.
await page.goto(`${BASE}/events/${org.slug}/${slug}`);
await hydrated();
await page.waitForLoadState('networkidle').catch(() => undefined);
await bell();
await shot('5-public');
const rsvp = page.getByRole('button', { name: /RSVP/ }).filter({ visible: true });
console.log('RSVP buttons:', await rsvp.count(), await rsvp.allTextContents());
console.log('address on page:', await page.getByText(EVENT_ADDRESS).filter({ visible: true }).count());
console.log('Location TBD on page:', await page.getByText('Location TBD').count());
console.log('description on public page:', await page.getByText('good speakers').filter({ visible: true }).count());
await page.mouse.wheel(0, 600);
await page.waitForTimeout(500);
await shot('5b-public-scrolled');

await browser.close();
console.log('PROBE PASSED', `/events/${org.slug}/${slug}`);
