// Probe for Episode 11 · "No account needed". Arranges a public RSVP event
// that allows guests (`can_attend_without_login`), then walks the whole
// logged-OUT path the episode films: the event page's guest RSVP button, the
// dialog (name + email), the "Check your email!" state, the confirmation
// email as Mailpit renders it (HTML body only, at /view/<ID>.html), the
// Confirm button inside that email, the confirm-action page, and the event
// page in its "RSVP Confirmed!" state.
//
//   node probes/ep-no-account.mjs
import { chromium } from 'playwright';
import { api, createDressedOrg, createEvent } from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const SCR = '/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-no-account';
const ADDRESS = 'Augartenspitz, Obere Augartenstraße 1, 1020 Vienna, Austria';

// ---- Arrange ---------------------------------------------------------------
const org = await createDressedOrg({
	name: 'Lichtspiel Open Air',
	description:
		'A volunteer-run open-air cinema in the Augarten. One film a week from June to September, a borrowed projector, folding chairs, and whatever the weather decides. Free to come; bring a blanket.',
	address: ADDRESS
});
const event = await createEvent(org.slug, org.owner.token, {
	name: 'Open-Air Night: Wings of Desire',
	description:
		'Wim Wenders’ black-and-white Berlin, on the big inflatable screen at the tip of the Augarten. Doors at sunset, film at dark. No tickets, no sign-up — just tell us you are coming so we know how many chairs to unfold.',
	address: ADDRESS,
	requires_ticket: false,
	max_attendees: 200,
	can_attend_without_login: true
});
const pub = await api(`/api/events/${org.slug}/event/${event.slug}`);
console.log('arrange:', event.path, event.id);
console.log('  can_attend_without_login', pub.can_attend_without_login, '| requires_ticket', pub.requires_ticket, '| status', pub.status, '| address', pub.address);
if (pub.can_attend_without_login !== true) throw new Error('arrange: can_attend_without_login did not stick');
if (pub.requires_ticket !== false) throw new Error('arrange: requires_ticket should be false');

const stamp = Date.now().toString(36).slice(-4);
const guest = { first: 'Nora', last: 'Lindqvist', email: `nora.lindqvist.${stamp}@example.com` };

// ---- Browser: a FRESH context, never logged in ------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const hydrated = () => page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
const shot = (name) => page.screenshot({ path: `${SCR}/probe-${name}.png` });

// ---- Scene "guest": the event page, logged out
await page.goto(BASE + event.path);
await hydrated();
await page.waitForLoadState('networkidle').catch(() => undefined);
console.log('guest: header Login link count', await page.getByRole('link', { name: 'Login' }).count(), '| bell', await page.getByRole('button', { name: 'Open notifications' }).count());
const submitBtn = page.getByRole('button', { name: 'Submit RSVP' }).filter({ visible: true });
await submitBtn.first().waitFor({ timeout: 20000 });
console.log('guest: "Submit RSVP" visible buttons', await submitBtn.count(), '| "Will you attend?"', await page.getByText('Will you attend?').filter({ visible: true }).count(), '| description', await page.getByText('Enter your details to RSVP').filter({ visible: true }).count());
const box = await submitBtn.first().boundingBox();
console.log('guest: button box', JSON.stringify(box));
console.log('guest: Location TBD?', await page.getByText('Location TBD').count());
await shot('event');
await submitBtn.first().click();
const dialog = page.getByRole('dialog');
await dialog.getByText('RSVP without an account').waitFor({ timeout: 10000 });
console.log('dialog: title OK | labels', await dialog.getByLabel('Email address').count(), await dialog.getByLabel('First name').count(), await dialog.getByLabel('Last name').count(), '| answer radios', await dialog.getByRole('radio').count(), '| Yes checked?', await dialog.locator('#rsvp-yes').getAttribute('aria-checked').catch(() => '?'));
console.log('dialog: note field present?', await dialog.locator('#guest-rsvp-note').count());
await dialog.locator('#guest-first-name').fill(guest.first);
await dialog.locator('#guest-last-name').fill(guest.last);
await dialog.locator('#guest-email').fill(guest.email);
console.log('dialog: typed', await dialog.locator('#guest-first-name').inputValue(), await dialog.locator('#guest-last-name').inputValue(), await dialog.locator('#guest-email').inputValue());
await shot('dialog');
const dlgSubmit = dialog.getByRole('button', { name: 'Submit RSVP' });
console.log('dialog: submit buttons', await dlgSubmit.count());
await dlgSubmit.click();
await dialog.getByText('Check your email!').waitFor({ timeout: 15000 });
console.log('dialog: success text:', JSON.stringify((await dialog.innerText()).slice(0, 300)));
await shot('sent');

// ---- Find the email --------------------------------------------------------
const intercepted = `+${guest.email.replace('@', '_at_').replaceAll('.', '_dot_')}@`;
let msg;
const deadline = Date.now() + 20000;
while (!msg) {
	for (const q of [`to:"${guest.email}"`, `to:"${intercepted}"`]) {
		const data = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(q)}&limit=5`)).json();
		if (data.messages?.[0]) {
			msg = data.messages[0];
			break;
		}
	}
	if (!msg) {
		if (Date.now() > deadline) throw new Error('no confirmation email');
		await new Promise((r) => setTimeout(r, 500));
	}
}
console.log('email: ID', msg.ID, '| subject', msg.Subject, '| to', JSON.stringify(msg.To), '| from', JSON.stringify(msg.From));
const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
const link = full.Text.match(/https?:\/\/\S*confirm-action\?token=\S+/)?.[0];
console.log('email: confirm link', link?.slice(0, 90) + '…');
if (!link) throw new Error('no confirm link in email text');
for (const u of [`/view/${msg.ID}.html`, `/view/${msg.ID}`]) {
	const r = await fetch(`${MAILPIT}${u}`);
	const body = await r.text();
	console.log(`email: ${u} → ${r.status} ${r.headers.get('content-type')} | has Confirm RSVP: ${body.includes('Confirm RSVP')} | has Mailpit chrome: ${body.includes('data-webroot')} | length ${body.length}`);
}

// ---- Scene "email": the recorded page shows the email HTML
await page.goto(`${MAILPIT}/view/${msg.ID}.html`);
await page.waitForLoadState('load');
await page.waitForTimeout(800);
console.log('email page: title', JSON.stringify(await page.title()), '| Confirm RSVP link', await page.getByRole('link', { name: 'Confirm RSVP' }).count(), '| Mailpit chrome (#app)', await page.locator('#app[data-webroot]').count());
const imgs = await page.locator('img').evaluateAll((els) => els.map((e) => [e.getAttribute('src')?.slice(0, 80), e.naturalWidth]));
console.log('email page: images', JSON.stringify(imgs));
const confirmLink = page.getByRole('link', { name: 'Confirm RSVP' }).first();
console.log('email page: confirm href', (await confirmLink.getAttribute('href'))?.slice(0, 80), '| target', await confirmLink.getAttribute('target'));
console.log('email page: confirm box', JSON.stringify(await confirmLink.boundingBox()));
await shot('email');

// ---- Scene "confirmed": click the button in the email → confirm-action page
await confirmLink.click();
await page.waitForURL(/confirm-action/, { timeout: 15000 });
await hydrated();
const confirmedTitle = page.getByRole('heading', { name: 'RSVP Confirmed!' });
await confirmedTitle.waitFor({ timeout: 20000 });
console.log('confirm page: url', page.url().slice(0, 70), '| heading OK | body', await page.getByText('Your RSVP has been confirmed').count(), '| View Event button', await page.getByRole('button', { name: 'View Event Details' }).count());
await shot('confirmed');
await page.getByRole('button', { name: 'View Event Details' }).click();
await page.waitForURL(/\/events\//, { timeout: 15000 });
await hydrated();
await page.waitForLoadState('networkidle').catch(() => undefined);
await page.waitForTimeout(800);
console.log('event after: url', page.url(), '| banner "RSVP Confirmed!"', await page.getByText('RSVP Confirmed!').filter({ visible: true }).count(), '| "See you there"', await page.getByText('See you there').filter({ visible: true }).count());
console.log('event after: guest button still shown?', await page.getByRole('button', { name: 'Submit RSVP' }).filter({ visible: true }).count());
await shot('event-after');

// ---- Verify through the API as the owner: the guest is on the list
const att = await api(`/api/event-admin/${event.id}/rsvps?page_size=10`, { token: org.owner.token }).catch((e) => ({ error: String(e).slice(0, 200) }));
console.log('owner rsvps:', JSON.stringify(att).slice(0, 400));

await browser.close();
console.log('PROBE PASSED');
