// Probe for ep-safer-spaces: arranges a social-dance collective with an open
// R S V P night and a fresh user called Jordan Vale, then walks every selector
// the episode touches — the owner's blacklist page and its "Add to Blacklist"
// dialog (name-only entry), Jordan's event page with the verification message
// and the "Request Verification" dialog, and the owner's Verification Requests
// tab. Verifies through the API that the name-only entry fuzzy-matches a
// non-member (reason_code verification_required) and that the request landed.
import { chromium } from 'playwright';
import { api, createDressedOrg, createEvent, registerVerifiedUser } from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SCR = '/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-safer-spaces';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const ADDRESS = 'Yppenplatz 4, 1160 Vienna, Austria';
const REASON = 'Repeated boundary issues at two events — not welcome back.';
const MESSAGE = "I think this is a mix-up — I've never been to one of your events; happy to talk.";

// ---- Arrange
const org = await createDressedOrg({
	name: 'Open Floor Social Dance',
	description:
		'A monthly social dance in a rented hall in Ottakring: an hour of beginner steps, then open floor until late. We keep a short code of conduct — ask before you touch, a no is a no, and any host will help if something feels off. Everyone dances with everyone.',
	address: ADDRESS
});
const event = await createEvent(org.slug, org.owner.token, {
	name: 'Saturday Social: Open Floor',
	description:
		'Beginner steps from eight, open floor from nine, tea and biscuits at the back. Free — just R S V P so we know how many people to expect. Come alone or bring a friend; you will be dancing with everyone.',
	requires_ticket: false,
	max_attendees: 60,
	address: ADDRESS
});
// Jordan is registered BEFORE the entry exists (the entry is made on camera),
// and is not a member of the collective — so the fuzzy gate applies.
const jordan = await registerVerifiedUser('jordan', 'Jordan', 'Vale', { emailLocal: 'jordan.vale' });
log('arranged', org.slug, event.path, event.id, '| jordan', jordan.email);

const before = await api(`/api/events/${event.id}/my-status`, { token: jordan.token });
log('jordan my-status BEFORE entry:', JSON.stringify(before).slice(0, 200));

// ---- Browser
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const hydrated = () => page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
const waitAuth = () => page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });

async function uiLoginOn(p, email, password) {
	await p.goto(BASE + '/login');
	await p.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	const reveal = p.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
	await p.getByLabel('Email address').fill(email);
	await p.getByLabel('Password', { exact: true }).fill(password);
	await p.getByRole('button', { name: 'Sign in', exact: true }).click();
	await p.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
}
const uiLogin = (email, password) => uiLoginOn(page, email, password);
async function logout() {
	const side = await context.newPage();
	await side.goto(BASE + '/logout');
	await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
	await side.close();
}

// ---- Owner: the blacklist page, add a name-only entry
await uiLogin(org.owner.email, org.owner.password);
await waitAuth();
const blacklistPath = `/org/${org.slug}/admin/blacklist`;
await page.goto(BASE + blacklistPath);
await hydrated();
await waitAuth();
await page.getByRole('heading', { name: 'Blacklist Management' }).first().waitFor({ timeout: 15000 });
log('owner: page heading OK; empty state count:', await page.getByText('No blacklist entries').count());
const addBtn = page.getByRole('button', { name: 'Add to Blacklist' }).filter({ visible: true });
log('owner: "Add to Blacklist" buttons visible:', await addBtn.count());
await addBtn.first().click();
const dialog = page.getByRole('dialog');
await dialog.getByText('Name Information').waitFor({ timeout: 10000 });
await dialog.locator('#first-name').fill('Jordan');
await dialog.locator('#last-name').fill('Vale');
await dialog.locator('#reason').fill(REASON);
log('dialog: first=', await dialog.locator('#first-name').inputValue(), 'last=', await dialog.locator('#last-name').inputValue(), 'reason len=', (await dialog.locator('#reason').inputValue()).length);
await page.screenshot({ path: SCR + '/p-dialog.png' });
const submit = dialog.getByRole('button', { name: 'Add to Blacklist' });
log('dialog submit enabled:', await submit.isEnabled());
await submit.click();
await page.getByRole('heading', { name: 'Jordan Vale' }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
log('owner: entry card appeared OK');
const card = page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Jordan Vale' }) }).first();
log('entry card text:', (await card.innerText()).replace(/\s+/g, ' ').slice(0, 300));
await page.screenshot({ path: SCR + '/p-entry.png' });

// API: entry exists, Jordan now fuzzy-matches
const list = await api(`/api/organization-admin/${org.slug}/blacklist`, { token: org.owner.token });
const entry = (list.results ?? []).find((e) => e.first_name === 'Jordan' && e.last_name === 'Vale');
if (!entry) throw new Error('entry not in blacklist list via API');
log('API entry:', entry.id, 'user_id', entry.user_id, 'reason', entry.reason);
const after = await api(`/api/events/${event.id}/my-status`, { token: jordan.token });
log('jordan my-status AFTER entry:', JSON.stringify(after).slice(0, 300));
if (after.reason_code !== 'verification_required' || after.next_step !== 'request_whitelist') {
	throw new Error(`fuzzy match did not trigger for the non-member: ${JSON.stringify(after)}`);
}

// ---- Jordan: the event page
await logout();
await uiLogin(jordan.email, jordan.password);
await page.goto(BASE + event.path);
await hydrated();
await waitAuth();
const msg = page.getByText('Additional verification required').filter({ visible: true }).first();
await msg.waitFor({ timeout: 15000 });
log('jordan: verification message visible OK; RSVP Yes buttons:', await page.getByRole('button', { name: /RSVP Yes/ }).count(), '; Location TBD:', await page.getByText('Location TBD').count());
const box = page.locator('[role="status"]', { hasText: 'Additional verification required' }).filter({ visible: true }).first();
log('status box text:', (await box.innerText()).replace(/\s+/g, ' ').slice(0, 300));
const bb = await box.boundingBox();
log('status box bbox:', JSON.stringify(bb));
await page.screenshot({ path: SCR + '/p-blocked.png' });
const reqBtn = page.getByRole('button', { name: 'Request Verification' }).filter({ visible: true }).first();
await reqBtn.waitFor({ timeout: 10000 });
await reqBtn.click();
const wdialog = page.getByRole('dialog');
await wdialog.getByText('Request Verification').first().waitFor({ timeout: 10000 });
log('whitelist dialog description:', (await wdialog.innerText()).replace(/\s+/g, ' ').slice(0, 300));
await wdialog.locator('#whitelist-message').fill(MESSAGE);
log('message value len:', (await wdialog.locator('#whitelist-message').inputValue()).length);
await page.screenshot({ path: SCR + '/p-request-dialog.png' });
await wdialog.getByRole('button', { name: 'Submit Request' }).click();
await wdialog.getByText('Verification Request Submitted').waitFor({ timeout: 15000 });
log('jordan: submitted state visible OK');
await page.screenshot({ path: SCR + '/p-submitted.png' });
// The dialog closes itself after ~2 s and the page refreshes status.
await page.waitForTimeout(3500);
const pending = page.getByText(/pending approval|Verification Requested/).filter({ visible: true }).first();
log('after close — pending text visible:', await pending.isVisible().catch(() => false), '|', await pending.innerText().catch(() => '(none)'));
await page.screenshot({ path: SCR + '/p-after-request.png' });

// API: the request exists with the message
const reqs = await api(`/api/organization-admin/${org.slug}/whitelist-requests?status=pending`, { token: org.owner.token });
const req = (reqs.results ?? []).find((r) => r.user_email === jordan.email);
if (!req) throw new Error('whitelist request not found via API');
log('API request:', req.id, req.status, 'matched', req.matched_entries_count, 'message:', req.message);
const status2 = await api(`/api/events/${event.id}/my-status`, { token: jordan.token });
log('jordan my-status after request:', status2.reason_code, status2.next_step);

// ---- Owner: the Verification Requests tab. The switch mimics the demo's
// switchUser: side page logs out and in while the recorded page stays put —
// but it waits for the side page's own client auth to land before closing,
// because closing mid-refresh drops the rotated cookie and the next page
// load then presents a blacklisted refresh token.
{
	const side = await context.newPage();
	await side.goto(BASE + '/logout');
	await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
	await uiLoginOn(side, org.owner.email, org.owner.password);
	log('side page: dashboard bell after owner login:', await side.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 30000 }).then(() => true).catch(() => false));
	await side.close();
}
await page.goto(BASE + blacklistPath);
await hydrated();
try {
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 40000 });
} catch (e) {
	log('owner #2: no bell after 40s; url=', page.url());
	log('header text:', (await page.locator('header').first().innerText().catch(() => '(no header)')).replace(/\s+/g, ' ').slice(0, 200));
	await page.screenshot({ path: SCR + '/p-owner2-fail.png' });
	throw e;
}
await page.getByRole('heading', { name: 'Jordan Vale' }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
const tab = page.getByRole('tab', { name: /Verification Requests/ });
log('tab count:', await tab.count(), 'text:', await tab.first().innerText());
await tab.first().click();
await page.getByText('Message from user:').filter({ visible: true }).first().waitFor({ timeout: 15000 });
const rcard = page.locator('div.rounded-lg', { has: page.getByText('Message from user:') }).first();
log('request card text:', (await rcard.innerText()).replace(/\s+/g, ' ').slice(0, 400));
log('approve/reject buttons:', await page.getByRole('button', { name: 'Approve' }).count(), await page.getByRole('button', { name: 'Reject' }).count());
await page.screenshot({ path: SCR + '/p-queue.png' });

await browser.close();
log('PROBE PASSED');
