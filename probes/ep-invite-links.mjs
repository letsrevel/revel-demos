// Probe for ep-invite-links: arranges the invitation-only night, then walks
// every selector the episode touches — the owner's Invitation Links tab and its
// create dialog, the uninvited attendee's locked event page, the /join/event
// preview, the claim, and the R S V P that follows.
import { chromium } from 'playwright';
import { api, createDressedOrg, createEvent, createEventToken, registerVerifiedUser } from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SCR = '/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-invite-links';

// ---- Arrange
const org = await createDressedOrg({
	name: 'Nachtschicht Listening Room',
	description: 'probe org',
	address: 'Gumpendorfer Straße 63, 1060 Vienna, Austria'
});
const event = await createEvent(org.slug, org.owner.token, {
	name: 'Late Session: Tape Loops & Tea',
	description: 'probe event',
	event_type: 'private',
	visibility: 'public',
	requires_ticket: false,
	max_attendees: 30,
	address: 'Gumpendorfer Straße 63, 1060 Vienna, Austria'
});
const existing = await createEventToken(event.id, org.owner.token, {
	name: 'Regulars (WhatsApp group)',
	max_uses: 25,
	duration: 30 * 24 * 60
});
const guest = await registerVerifiedUser('invitee', 'Mira', 'Haddad', { emailLocal: 'mira.haddad' });
console.log('arrange: OK', event.path, 'event_type=', event.event_type, 'existing token', existing.id);

// Verify arranged state through the API: the event is private, the guest is
// not invited (eligibility says so), the pre-made link is listed.
const detail = await api(`/api/events/${event.id}`, { token: org.owner.token });
if (detail.event_type !== 'private') throw new Error(`event_type is ${detail.event_type}, not private`);
const status = await api(`/api/events/${event.id}/my-status`, { token: guest.token }).catch((e) => ({ error: String(e) }));
console.log('guest my-status:', JSON.stringify(status).slice(0, 300));
const list = await api(`/api/event-admin/${event.id}/tokens`, { token: org.owner.token });
console.log('tokens listed:', list.results.map((t) => `${t.name} ${t.uses}/${t.max_uses}`));

// ---- Browser
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const hydrated = () => page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });

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
async function logout() {
	const side = await context.newPage();
	await side.goto(BASE + '/logout');
	await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
	await side.close();
}

// ---- Owner: the Links tab
await uiLogin(org.owner.email, org.owner.password);
await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
const linksPath = `/org/${org.slug}/admin/events/${event.id}/invitations?tab=links`;
await page.goto(BASE + linksPath);
await hydrated();
await page.getByRole('heading', { name: 'Regulars (WhatsApp group)' }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
console.log('owner: links tab shows the arranged link OK');
const headerCreate = page.getByRole('button', { name: 'Create Link' }).filter({ visible: true }).first();
await headerCreate.click();
const dialog = page.getByRole('dialog');
await dialog.getByText('Create Invitation Link').waitFor({ timeout: 10000 });
await dialog.locator('#link-name').fill('Friends of the band');
const maxUses = dialog.locator('#max-uses');
await maxUses.fill('10');
const expires = dialog.locator('#expires-at');
console.log('dialog: name=', await dialog.locator('#link-name').inputValue(), 'max-uses=', await maxUses.inputValue(), 'expires=', await expires.inputValue());
const advanced = dialog.getByRole('button', { name: 'Advanced Invitation Options' });
console.log('advanced toggle count:', await advanced.count());
await advanced.click();
await dialog.getByText('Waive questionnaire requirement').waitFor({ timeout: 5000 });
await page.screenshot({ path: SCR + '/p-dialog-advanced.png' });
await dialog.getByRole('button', { name: 'Create Link' }).click();
await page.getByRole('heading', { name: 'Friends of the band' }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
console.log('owner: new link card appeared OK');
const card = page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Friends of the band' }) }).first();
console.log('card text:', (await card.innerText()).replace(/\s+/g, ' ').slice(0, 300));
await card.getByRole('button', { name: 'Share token' }).click();
const shareUrl = await page.locator('#share-url').inputValue();
console.log('share dialog url:', shareUrl);
await page.screenshot({ path: SCR + '/p-share.png' });
await page.getByRole('dialog').locator('button', { hasText: /^Close$/ }).click();

const after = await api(`/api/event-admin/${event.id}/tokens`, { token: org.owner.token });
const made = after.results.find((t) => t.name === 'Friends of the band');
if (!made) throw new Error('token not found via API');
console.log('API: token', made.id, 'max_uses', made.max_uses, 'grants', made.grants_invitation, 'expires', made.expires_at);
if (!shareUrl.endsWith(`/join/event/${made.id}`)) throw new Error('share url does not match token id');

// ---- Attendee: locked event page
await logout();
await uiLogin(guest.email, guest.password);
await page.goto(BASE + event.path);
await hydrated();
await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
const locked = page.getByText('Invitation required').filter({ visible: true }).first();
await locked.waitFor({ timeout: 15000 });
const reqBtn = page.getByRole('button', { name: 'Request Invitation' }).filter({ visible: true }).first();
console.log('guest: locked state visible OK; Request Invitation buttons:', await reqBtn.count(), '; RSVP Yes buttons:', await page.getByRole('button', { name: 'Yes' }).count());
console.log('guest: "Location TBD" on page?', await page.getByText('Location TBD').count());
await page.screenshot({ path: SCR + '/p-locked.png' });

// The token preview endpoint is anonymous and throttled per IP (60/min shared
// with everything on this host), so prime it on a side page until it renders.
async function primeJoin(id) {
	const side = await context.newPage();
	for (let i = 0; i < 12; i++) {
		await side.goto(BASE + `/join/event/${id}`);
		if (await side.getByText("You've been invited!").isVisible({ timeout: 4000 }).catch(() => false)) {
			await side.close();
			return i;
		}
		await side.waitForTimeout(5000);
	}
	await side.close();
	throw new Error('join preview never rendered');
}
console.log('primeJoin attempts before OK:', await primeJoin(made.id));

// ---- Attendee: the join preview
await page.goto(BASE + `/join/event/${made.id}`);
await hydrated();
await page.getByText("You've been invited!").filter({ visible: true }).first().waitFor({ timeout: 15000 });
const claim = page.getByRole('button', { name: 'Claim Invitation' });
await claim.waitFor({ timeout: 20000 });
await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
await page.getByText('Mira', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
console.log('preview: header shows Mira OK');
console.log('preview: ', (await page.locator('body').innerText()).replace(/\s+/g, ' ').match(/You.re invited.{0,400}/)?.[0]);
await page.screenshot({ path: SCR + '/p-preview.png' });
await claim.click();
await page.waitForURL(new RegExp(event.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 20000 });
await hydrated();
console.log('claim: landed on', page.url());
const yes = page.getByRole('button', { name: /RSVP Yes/ }).filter({ visible: true }).first();
await yes.waitFor({ timeout: 20000 });
console.log('event page after claim: Yes button visible OK');
await page.screenshot({ path: SCR + '/p-eligible.png' });
await yes.click();
// The event may or may not accept R S V P notes; when it does, a confirm
// dialog sits between the click and the submit.
const confirm = page.getByRole('dialog').getByRole('button', { name: 'RSVP Yes' });
if (await confirm.isVisible({ timeout: 2500 }).catch(() => false)) {
	console.log('rsvp: note dialog appeared');
	await confirm.click();
} else console.log('rsvp: no note dialog (event does not accept notes)');
const outcome = page.getByText(/You.re attending|RSVP Failed/).filter({ visible: true }).first();
await outcome.waitFor({ timeout: 15000 }).catch(() => undefined);
await page.screenshot({ path: SCR + '/p-rsvp.png' });
console.log('rsvp outcome text:', await outcome.innerText().catch(() => '(none)'));
const failText = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
console.log('alerts:', JSON.stringify(failText).slice(0, 400));
await page.getByText("You're attending").filter({ visible: true }).first().waitFor({ timeout: 1000 });
console.log('rsvp: confirmation visible OK');
await page.screenshot({ path: SCR + '/p-rsvp.png' });
const tokAfter = await api(`/api/event-admin/${event.id}/tokens`, { token: org.owner.token });
console.log('API: uses now', tokAfter.results.find((t) => t.id === made.id).uses);

await browser.close();
console.log('PROBE PASSED');
