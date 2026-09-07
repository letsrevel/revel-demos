// Probe for ep-announcements: arranges a listening club with an RSVP event and
// six attendees, then walks every selector the episode touches — the owner's
// compose modal (title, message, "Event Attendees", the event picker, Send),
// the Sent tab's recipient count, and the attendee's bell + the event page's
// announcements section. Verifies through the API that the send produced a
// notification for the attendee we film.
import { chromium } from 'playwright';
import { api, createDressedOrg, createEvent, registerVerifiedUser, rsvpYes } from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---- Arrange
const org = await createDressedOrg({
	name: 'Vinyl Listening Club',
	description:
		'A monthly listening session for people who still sit down for a whole record. One album, front to back, no phones, good speakers. Bring a friend and an opinion.',
	address: 'Café Korb, Brandstätte 9, 1010 Vienna, Austria'
});
const event = await createEvent(org.slug, org.owner.token, {
	name: 'Friday Listening Session: Blue Train',
	description:
		'This month we sit down with Coltrane’s Blue Train, front to back, on the big speakers. Doors at half seven, needle drops at eight. Free — just say you’re coming so we know how many chairs to set out.',
	requires_ticket: false,
	max_attendees: 40,
	address: 'Café Korb, Brandstätte 9, 1010 Vienna, Austria'
});
log('arranged', org.slug, event.path, event.id);

const cast = [
	['Lena', 'Hartmann', 'lena.hartmann'],
	['Tomas', 'Berger', 'tomas.berger'],
	['Priya', 'Nair', 'priya.nair'],
	['Jonas', 'Wieser', 'jonas.wieser'],
	['Mira', 'Kovac', 'mira.kovac'],
	['Elif', 'Demir', 'elif.demir']
];
const attendees = [];
for (const [first, last, emailLocal] of cast) {
	const u = await registerVerifiedUser(emailLocal.replace('.', '-'), first, last, { emailLocal });
	await rsvpYes(event.id, u.token);
	attendees.push(u);
}
const lena = attendees[0];
// Clear whatever the RSVP itself notified, so the announcement is the one unread.
await api('/api/notifications/mark-all-read', { method: 'POST', token: lena.token, body: {} });
const before = await api('/api/notifications/unread-count', { token: lena.token });
log('attendees RSVP’d:', attendees.length, '| lena unread before send:', JSON.stringify(before));

// ---- Owner UI walk
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
// Log every announcement API exchange the browser makes — the demo's /send
// has been refused while the same call from curl succeeds.
page.on('response', async (res) => {
	if (!res.url().includes('/announcements')) return;
	let body = '';
	try { body = (await res.text()).slice(0, 200); } catch {}
	log('HTTP', res.request().method(), res.status(), new URL(res.url()).pathname, body);
});

async function uiLogin(p, email, password) {
	await p.goto(BASE + '/login');
	await p.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	const reveal = p.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
	await p.getByLabel('Email address').fill(email);
	await p.getByLabel('Password', { exact: true }).fill(password);
	await p.getByRole('button', { name: 'Sign in', exact: true }).click();
	await p.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
}
const waitAuth = (p) => p.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });

await uiLogin(page, org.owner.email, org.owner.password);
const adminPath = `/org/${org.slug}/admin/announcements`;
for (let attempt = 0; ; attempt++) {
	await page.goto(BASE + adminPath);
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	const ok = await waitAuth(page).then(() => true, () => false);
	if (ok) break;
	log('client auth did not land on the admin page, attempt', attempt + 1);
	if (attempt >= 2) throw new Error('client auth never landed');
	await page.waitForTimeout(4000);
}
await page.getByRole('heading', { name: 'Announcements' }).first().waitFor({ timeout: 15000 });
log('admin page: heading + auth OK; empty state:', await page.getByText('No draft announcements').count());

await page.getByRole('button', { name: 'New Announcement' }).first().click();
const dialog = page.getByRole('dialog');
await dialog.waitFor({ timeout: 10000 });
log('modal open:', await dialog.getByRole('heading', { name: 'New Announcement' }).count());

const titleInput = dialog.getByLabel('Title');
await titleInput.pressSequentially('Venue change for Friday', { delay: 20 });
log('title typed:', await titleInput.inputValue());

const body = dialog.getByRole('textbox', { name: 'Message' });
await body.waitFor({ timeout: 10000 });
await body.click();
await page.keyboard.type(
	'Friday’s session moves to the back room at Café Korb, same start time. The bar downstairs is closed for a private party, so come in through the side entrance on Brandstätte.',
	{ delay: 5 }
);
log('body typed (editor text):', (await body.innerText()).slice(0, 60), '…');

const targets = ['All Members', 'Staff Only', 'Event Attendees'];
for (const t of targets) log('target option:', t, await dialog.getByRole('button', { name: t }).count());
log('advanced targeting toggle:', await dialog.getByRole('button', { name: 'Advanced Targeting' }).count());
await dialog.getByRole('button', { name: 'Event Attendees' }).click();

const picker = dialog.getByRole('combobox');
await picker.waitFor({ timeout: 10000 });
await picker.click();
const option = dialog.getByRole('option', { name: new RegExp(event.name) });
await option.waitFor({ timeout: 15000 });
log('event option visible:', await option.innerText());
await option.click();
log('picker value:', await picker.inputValue());

log('when-to-send radios:', await dialog.getByRole('radio', { name: 'Send now' }).count(), await dialog.getByRole('radio', { name: 'Schedule' }).count());
log('late-joiner checkbox:', await dialog.getByLabel('Show on the page to people who join later').count());

const sendBtn = dialog.getByRole('button', { name: 'Send', exact: true });
log('send button:', await sendBtn.count());
await sendBtn.click();
await dialog.waitFor({ state: 'hidden', timeout: 20000 });
const toast = page.getByText('Announcement sent');
await toast.waitFor({ timeout: 10000 }).catch(() => undefined);
log('modal closed after send; toast:', await toast.count());

await page.getByRole('tab', { name: 'Sent' }).click();
// Inactive tab panels stay in the DOM: filter to the visible copies.
const card = page.getByRole('heading', { name: 'Venue change for Friday' }).filter({ visible: true }).first();
await card.waitFor({ timeout: 15000 });
const recipients = page.getByText(/\d+ recipients/).filter({ visible: true }).first();
await recipients.waitFor({ timeout: 15000 });
log('sent card:', await card.innerText(), '|', await recipients.innerText(), '|', await page.getByText(`Event: ${event.name}`).count(), 'event badge');

// ---- API verification
const list = await api(`/api/organization-admin/${org.slug}/announcements?status=sent`, { token: org.owner.token });
const ann = list.results?.[0];
log('API announcement:', ann?.status, 'recipient_count=', ann?.recipient_count, 'event_id ok=', ann?.event_id === event.id);
if (ann?.recipient_count !== attendees.length) throw new Error(`expected ${attendees.length} recipients, got ${ann?.recipient_count}`);

let notif;
for (let i = 0; i < 20 && !notif; i++) {
	const page1 = await api('/api/notifications?page_size=10', { token: lena.token });
	notif = (page1.results ?? []).find((n) => n.notification_type === 'org_announcement');
	if (!notif) await new Promise((r) => setTimeout(r, 500));
}
if (!notif) throw new Error('lena never received the announcement notification');
const unread = await api('/api/notifications/unread-count', { token: lena.token });
log('lena notification:', notif.title, '| read_at:', notif.read_at, '| unread:', JSON.stringify(unread), '| context.event_url:', notif.context?.event_url);

// ---- Attendee UI walk
const side = await context.newPage();
await side.goto(BASE + '/logout');
await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
await side.close();
await uiLogin(page, lena.email, lena.password);
await page.goto(BASE + event.path);
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
const bell = page.getByRole('button', { name: 'Open notifications' });
await bell.waitFor({ timeout: 20000 });
const badge = bell.locator('[role="status"]');
await badge.waitFor({ timeout: 15000 });
log('bell badge:', await badge.innerText());
await bell.click();
const item = page.getByRole('button', { name: /Venue change for Friday/ }).first();
await item.waitFor({ timeout: 15000 });
log('dropdown item:', (await item.innerText()).replace(/\s+/g, ' ').slice(0, 120));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

const section = page.getByRole('heading', { name: 'Announcements' }).filter({ visible: true }).first();
await section.waitFor({ timeout: 15000 });
await section.scrollIntoViewIfNeeded();
const pubCard = page.getByRole('heading', { name: 'Venue change for Friday' }).filter({ visible: true }).first();
await pubCard.waitFor({ timeout: 15000 });
log('event page section:', await section.innerText(), '| card:', await pubCard.innerText(), '| audience:', await page.getByText('Visible to attendees of this event').count());
log('location on page:', await page.getByText('Location TBD').count() === 0 ? 'dressed OK' : 'LOCATION TBD ⚠️');

await browser.close();
console.log('PROBE PASSED');
