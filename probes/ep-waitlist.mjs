// Probe for Episode 5 · "The waitlist". Arranges a full RSVP event with an
// open waitlist, walks the third attendee's join → notification → RSVP path,
// and reports WHICH backend action actually produces the spot notification.
//
//   node probes/ep-waitlist.mjs               # advanced waitlist (time window set → offers)
//   SIMPLE=1 node probes/ep-waitlist.mjs      # plain waitlist, no time window
//   SKIP_RAISE=1 …                            # skip the capacity raise, test only "RSVP no"
//
// Findings (backend 2.9.0), which the demo relies on:
//   • Plain waitlist + raise max_attendees → NO notification (the processing
//     task returns "disabled" without a time window).
//   • Plain waitlist + an attendee RSVPs no → notification within a second,
//     but the in-app card renders "Claim your spot for … before ." (no expiry).
//   • Advanced waitlist (PATCH waitlist-settings waitlist_time_window=PT24H)
//     + raise max_attendees → an offer and a notification within a second,
//     card reads "…before Monday, September 7 at 9:57 PM" with a countdown.
import { chromium } from 'playwright';
import { api, createDressedOrg, createEvent, registerVerifiedUser, rsvpYes } from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const ADVANCED = !process.env.SIMPLE;

// ---- Arrange ---------------------------------------------------------------
const org = await createDressedOrg({
	name: 'The Darkroom Collective',
	description:
		'A shared analog darkroom in Neubau. Two enlargers, a drying line, and people who still like the smell of fixer. Members book the room; on Thursdays we print together.',
	address: 'Zieglergasse 42, 1070 Vienna, Austria'
});
const event = await createEvent(org.slug, org.owner.token, {
	name: 'Darkroom Night: Print Your Own',
	description:
		'Bring your negatives, we bring the chemistry. Two enlargers means two people per night, so places are tight — but there is a waitlist, and people do drop out.',
	address: 'Zieglergasse 42, 1070 Vienna, Austria',
	requires_ticket: false,
	max_attendees: 2,
	waitlist_open: true
});
if (ADVANCED) {
	await api(`/api/event-admin/${event.id}/waitlist-settings`, {
		method: 'PATCH',
		token: org.owner.token,
		body: { waitlist_time_window: 'PT24H' }
	});
}
const [mara, tomas, ines] = await Promise.all([
	registerVerifiedUser('a', 'Mara', 'Lindqvist', { emailLocal: 'mara.lindqvist' }),
	registerVerifiedUser('b', 'Tomas', 'Reyes', { emailLocal: 'tomas.reyes' }),
	registerVerifiedUser('c', 'Ines', 'Fournier', { emailLocal: 'ines.fournier' })
]);
await rsvpYes(event.id, mara.token);
await rsvpYes(event.id, tomas.token);

const pub = () => api(`/api/events/${org.slug}/event/${event.slug}`, { token: ines.token });
// attendee_count is recomputed off the request path — give it a moment.
let ev = await pub();
for (let i = 0; i < 20 && !ev.is_full; i++) {
	await new Promise((r) => setTimeout(r, 1000));
	ev = await pub().catch(() => ev);
}
console.log('arrange:', event.path, event.id);
console.log('  max_attendees', ev.max_attendees, 'attendee_count', ev.attendee_count, 'is_full', ev.is_full, 'waitlist_open', ev.waitlist_open, 'requires_ticket', ev.requires_ticket, 'address', ev.address);
if (!(ev.is_full && ev.waitlist_open && ev.attendee_count === 2)) throw new Error('arrange: event not full/waitlist-open');
const settings = await api(`/api/event-admin/${event.id}/waitlist-settings`, { token: org.owner.token });
console.log('  waitlist settings', JSON.stringify(settings));

// ---- Browser helpers ---------------------------------------------------------
const browser = await chromium.launch();
async function loggedInPage(email, password) {
	const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
	const page = await context.newPage();
	await page.goto(BASE + '/login');
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	const reveal = page.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
	await page.getByLabel('Email address').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
	return page;
}
async function open(page, path) {
	await page.goto(BASE + path);
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await page.waitForLoadState('networkidle').catch(() => undefined);
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
}
const shot = (page, name) =>
	page.screenshot({ path: `/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-waitlist/probe-${name}.png` });

// ---- Scene "full": third attendee sees a full event with Join the waitlist
const page = await loggedInPage(ines.email, ines.password);
await open(page, event.path);
const fullText = page.getByText('Event is full').filter({ visible: true });
console.log('full: "Event is full" visible count', await fullText.count());
const joinBtn = page.getByRole('button', { name: 'Join Waitlist' }).filter({ visible: true });
console.log('full: join buttons', await joinBtn.count());
if ((await joinBtn.count()) === 0) {
	console.log(await page.locator('main').innerText());
	throw new Error('no Join the waitlist button');
}
await joinBtn.first().scrollIntoViewIfNeeded();
await shot(page, 'full');
await joinBtn.first().click();
// The component reloads the page ~1.5 s after success.
await page.waitForTimeout(3500);
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
await page.waitForLoadState('networkidle').catch(() => undefined);
const onWl = page.getByText("You're on the waitlist").filter({ visible: true });
console.log('queued: "You\'re on the waitlist" visible count', await onWl.count());
console.log('queued: Leave buttons', await page.getByRole('button', { name: 'Leave' }).filter({ visible: true }).count());
await shot(page, 'queued');

// ---- Organizer's list (before the spot opens)
const wl = await api(`/api/event-admin/${event.id}/waitlist`, { token: org.owner.token });
console.log('owner waitlist API:', wl.count, JSON.stringify(wl.results?.[0] ?? null));
const owner = await loggedInPage(org.owner.email, org.owner.password);
const adminWl = `/org/${org.slug}/admin/events/${event.id}/waitlist`;
await open(owner, adminWl);
console.log('list: heading', await owner.getByRole('heading', { name: 'Event Waitlist' }).count());
console.log('list: empty state present?', await owner.getByText('No Waitlist Entries').count());
console.log('list: Ines row present?', await owner.getByText('Ines Fournier').filter({ visible: true }).count());
console.log('list: Login/Sign Up header?', await owner.getByRole('link', { name: 'Login' }).count());
await shot(owner, 'list');

// ---- Trigger the spot ------------------------------------------------------
async function pollNotification(token, seconds = 15) {
	const deadline = Date.now() + seconds * 1000;
	while (Date.now() < deadline) {
		const n = await api('/api/notifications?page_size=10', { token }).catch(() => ({}));
		const hit = (n.results ?? []).find((x) => x.notification_type === 'waitlist_spot_available');
		if (hit) return hit;
		await new Promise((r) => setTimeout(r, 1000));
	}
	return null;
}
async function raiseCapacity(to) {
	return api(`/api/event-admin/${event.id}`, {
		method: 'PUT',
		token: org.owner.token,
		body: {
			name: event.name,
			description: event.description,
			address: event.address,
			start: event.start,
			end: event.end,
			event_type: 'public',
			visibility: 'public',
			requires_ticket: false,
			max_attendees: to,
			waitlist_open: true
		}
	});
}
let trigger = null;
let notif = null;

if (!process.env.SKIP_RAISE) {
	const t0 = Date.now();
	await raiseCapacity(3);
	ev = await pub();
	console.log('trigger A (raise capacity → 3): max_attendees now', ev.max_attendees, 'is_full', ev.is_full, 'waitlist_open', ev.waitlist_open, 'address', ev.address);
	notif = await pollNotification(ines.token);
	if (notif) trigger = `raise capacity (${ADVANCED ? 'advanced' : 'simple'} mode)`;
	console.log(`trigger A → ${notif ? 'NOTIFIED after ' + Math.round((Date.now() - t0) / 1000) + 's' : 'no notification in 15 s'}`);
}

if (!notif) {
	const t1 = Date.now();
	await api(`/api/events/${event.id}/rsvp/no`, { method: 'POST', token: mara.token, body: {} });
	ev = await pub();
	console.log('trigger B (Mara RSVPs no): attendee_count', ev.attendee_count, 'is_full', ev.is_full);
	notif = await pollNotification(ines.token);
	if (notif) trigger = `RSVP no by an attendee (${ADVANCED ? 'advanced' : 'simple'} mode)`;
	console.log(`trigger B → ${notif ? 'NOTIFIED after ' + Math.round((Date.now() - t1) / 1000) + 's' : 'no notification in 15 s'}`);
}
if (!notif) throw new Error('no waitlist notification from any trigger');
console.log('notification:', JSON.stringify({ title: notif.title, body: notif.body, type: notif.notification_type, context: notif.context }, null, 1));
const status = await api(`/api/events/${event.id}/my-status`, { token: ines.token });
console.log('my-status after trigger:', JSON.stringify(status).slice(0, 600));

// ---- Scene "spot": bell → notification → RSVP yes
await open(page, event.path);
await page.waitForTimeout(1500);
const bell = page.getByRole('button', { name: 'Open notifications' });
console.log('spot: bell badge text:', JSON.stringify(await bell.innerText()));
await bell.click();
await page.waitForTimeout(1200);
const menu = page.locator('[role="menu"]');
console.log('spot: dropdown text:', JSON.stringify((await menu.innerText().catch(() => '<no menu>')).slice(0, 400)));
console.log('spot: "Your waitlist spot is ready"', await page.getByText('Your waitlist spot is ready').count(), '| "Spot available"', await page.getByText(/Spot available/).count(), '| Claim button', await page.getByRole('button', { name: 'Claim your spot' }).count());
await shot(page, 'bell');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
const yes = page.getByRole('button', { name: "RSVP Yes - I'm attending" }).filter({ visible: true });
console.log('spot: RSVP Yes buttons', await yes.count(), '| still "on the waitlist"?', await onWl.count(), '| "Will you attend?"', await page.getByText('Will you attend?').filter({ visible: true }).count());
if ((await yes.count()) === 0) {
	console.log(await page.locator('main').innerText());
	throw new Error('no RSVP yes button after spot opened');
}
await yes.first().scrollIntoViewIfNeeded();
await shot(page, 'rsvp');
await yes.first().click();
await page.waitForTimeout(2500);
console.log('spot: "You\'re going to"', await page.getByText(/going to/).filter({ visible: true }).count());
await shot(page, 'going');
ev = await pub();
console.log('after RSVP: attendee_count', ev.attendee_count, 'is_full', ev.is_full);
const wl2 = await api(`/api/event-admin/${event.id}/waitlist`, { token: org.owner.token });
console.log('owner waitlist after:', wl2.count);

await browser.close();
console.log(`PROBE PASSED — trigger that produced the notification: ${trigger}`);
