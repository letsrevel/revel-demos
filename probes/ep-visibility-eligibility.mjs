// Probe for Episode 14 · "Who can see it, who can come". Arranges a dressed
// choir with one member and one non-member and three open RSVP events across
// the visibility / event-type matrix, verifies through the API what each
// persona is shown and told, then walks every page and selector the episode
// touches: the owner's edit form (Visibility cards, "What's the difference?",
// Event Type cards), the outsider's org page and Members' Night, the member's
// org page and Members' Night with an RSVP.
//
//   node probes/ep-visibility-eligibility.mjs
import { chromium } from 'playwright';
import {
	api,
	createDressedOrg,
	createEvent,
	defaultMembershipTier,
	makeMember,
	registerVerifiedUser
} from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SHOT = process.env.SHOT_DIR || '';

// The org name is on camera in every scene, and org names are unique: a
// re-run of "Ottakring Community Choir" would become "… Studio" or "… II".
// Rotate the district instead — first one not taken wins — with a matching
// parish-hall address so the postcode agrees with the name.
const DISTRICTS = [
	['Ottakring', 'Pfarrgasse 3, 1160 Vienna, Austria'],
	['Hernals', 'Kalvarienberggasse 28, 1170 Vienna, Austria'],
	['Währing', 'Gentzgasse 60, 1180 Vienna, Austria'],
	['Döbling', 'Billrothstraße 8, 1190 Vienna, Austria'],
	['Meidling', 'Schönbrunner Straße 244, 1120 Vienna, Austria'],
	['Favoriten', 'Quellenstraße 52, 1100 Vienna, Austria'],
	['Simmering', 'Enkplatz 4, 1110 Vienna, Austria'],
	['Penzing', 'Linzer Straße 33, 1140 Vienna, Austria'],
	['Brigittenau', 'Wallensteinplatz 6, 1200 Vienna, Austria'],
	['Alsergrund', 'Servitengasse 9, 1090 Vienna, Austria']
];
export async function pickChoir() {
	const taken = new Set();
	const res = await api(`/api/organizations/?search=${encodeURIComponent('Community Choir')}&page_size=100`);
	for (const o of res.results ?? []) taken.add(o.name);
	for (const [district, address] of DISTRICTS) {
		const name = `${district} Community Choir`;
		if (!taken.has(name)) return { name, address };
	}
	return { name: 'Ottakring Community Choir', address: DISTRICTS[0][1] };
}
const CHOIR = await pickChoir();
const ADDRESS = CHOIR.address;
const dayMs = 24 * 60 * 60 * 1000;
const evening = (daysAhead, hourUtc = 17) => {
	const d = new Date(Date.now() + daysAhead * dayMs);
	d.setUTCHours(hourUtc, 30, 0, 0);
	return d;
};

// ---- Arrange -------------------------------------------------------------
const org = await createDressedOrg({
	name: CHOIR.name,
	description:
		'Forty voices from the district, no auditions, no sheet-music snobbery. We rehearse on Tuesdays in the parish hall and sing wherever people will have us. Come and listen first; join when you are ready.',
	address: ADDRESS
});
const owner = org.owner;
const cities = await api(`/api/cities/?search=${encodeURIComponent('Vienna')}&page_size=5`);
const vienna = (cities.results ?? []).find((c) => c.name === 'Vienna') ?? null;
console.log('city:', vienna);

const events = {};
const mk = async (key, overrides, daysAhead) => {
	const start = evening(daysAhead);
	events[key] = await createEvent(org.slug, owner.token, {
		requires_ticket: false,
		max_attendees: 0,
		address: ADDRESS.split(',')[0],
		...(vienna ? { city_id: vienna.id } : {}),
		start: start.toISOString(),
		end: new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
		...overrides
	});
};
await mk(
	'rehearsal',
	{
		name: 'Open Rehearsal',
		visibility: 'public',
		event_type: 'public',
		description:
			'Our regular Tuesday rehearsal, doors open. Sit at the back, hum along, or just see how it feels. No experience needed and nobody will make you sing alone.'
	},
	5
);
await mk(
	'night',
	{
		name: "Members' Night",
		visibility: 'public',
		event_type: 'members-only',
		description:
			'A long evening for the choir itself: the new autumn programme, a first read-through of the Brahms, and soup afterwards. Members only, but the page is public so friends know what we are up to.'
	},
	9
);
await mk(
	'committee',
	{
		name: 'Committee Meeting',
		visibility: 'members-only',
		event_type: 'members-only',
		description:
			'Quarterly committee: the budget, the spring concert venue, and who is bringing the soup next time. Members only, and not listed outside the choir.'
	},
	12
);
console.log('arrange: org', org.slug, '| owner', owner.email);
for (const [k, e] of Object.entries(events)) console.log(`  ${k}: ${e.id} ${e.path}`);

const tier = await defaultMembershipTier(org.slug, owner.token);
const member = await registerVerifiedUser('member', 'Lena', 'Hartmann', { emailLocal: 'lena.hartmann' });
await makeMember(org.slug, member.token, owner.token, tier.id);
const outsider = await registerVerifiedUser('outsider', 'Bea', 'Novak', { emailLocal: 'bea.novak' });
console.log('member', member.email, '| outsider', outsider.email, '| tier', tier.name);

// ---- Verify arranged state via the API -----------------------------------
const listFor = async (token) => {
	const res = await api(`/api/events/?organization_slug=${org.slug}&page_size=20`, token ? { token } : {});
	return (res.results ?? []).map((e) => e.name).sort();
};
const names = { anon: await listFor(null), outsider: await listFor(outsider.token), member: await listFor(member.token) };
console.log('list anon    :', names.anon);
console.log('list outsider:', names.outsider);
console.log('list member  :', names.member);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (!eq(names.outsider, ["Members' Night", 'Open Rehearsal'])) throw new Error('outsider list wrong');
if (!eq(names.member, ['Committee Meeting', "Members' Night", 'Open Rehearsal'])) throw new Error('member list wrong');

for (const [k, e] of Object.entries(events)) {
	const d = await api(`/api/events/${e.id}`, { token: owner.token });
	console.log(`  ${k}: visibility=${d.visibility} event_type=${d.event_type} status=${d.status} requires_ticket=${d.requires_ticket} address=${d.address} city=${d.city?.name}`);
	if (!d.city) throw new Error('city_id did NOT stick on ' + k);
}
const outStatus = await api(`/api/events/${events.night.id}/my-status`, { token: outsider.token });
console.log('outsider my-status on Members Night:', JSON.stringify(outStatus));
if (outStatus.allowed !== false || outStatus.next_step !== 'become_member') throw new Error('outsider should be told members-only / become_member');
const memStatus = await api(`/api/events/${events.night.id}/my-status`, { token: member.token });
console.log('member my-status on Members Night:', JSON.stringify(memStatus));
const outCommittee = await fetch(`http://localhost:8000/api/events/${events.committee.id}`, {
	headers: { Authorization: `Bearer ${outsider.token}` }
});
console.log('outsider GET committee event →', outCommittee.status);
console.log('verify: API OK');

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
async function logout() {
	const side = await context.newPage();
	await side.goto(BASE + '/logout');
	await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
	await side.close();
}
async function gotoReady(path) {
	await page.goto(BASE + path);
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
	await page.waitForLoadState('networkidle').catch(() => undefined);
}
const vis = (loc) => loc.filter({ visible: true }).first();
const box = async (loc) => {
	const b = await loc.boundingBox().catch(() => null);
	return b ? `y=${Math.round(b.y)} h=${Math.round(b.height)} x=${Math.round(b.x)}` : 'NO BOX';
};

// ---- Persona A: owner on the Members' Night edit form
await uiLogin(owner.email, owner.password);
const editPath = `/org/${org.slug}/admin/events/${events.night.id}/edit`;
await gotoReady(editPath);
const visGroup = page.getByRole('radiogroup', { name: 'Event visibility' });
const typeGroup = page.getByRole('radiogroup', { name: 'Event type' });
await visGroup.waitFor({ timeout: 15000 });
await typeGroup.waitFor({ timeout: 15000 });
console.log('owner: visibility group', await box(visGroup), '| type group', await box(typeGroup));
const diff = vis(page.getByText("What's the difference?"));
const diffCount = await page.getByText("What's the difference?").count();
console.log('owner: "What\'s the difference?" count', diffCount, '| first', await box(diff));
const visMembers = visGroup.getByText('Organization members only');
const typeMembers = typeGroup.getByText('Organization members only');
console.log('owner: visibility members card', await box(visMembers), '| type members card', await box(typeMembers));
console.log('owner: checked visibility =', await visGroup.locator('input:checked').getAttribute('value'), '| checked type =', await typeGroup.locator('input:checked').getAttribute('value'));
const whoCan = page.getByText('Who can view:');
console.log('owner: "Who can view" count', await whoCan.count(), await box(vis(whoCan)));
const hint = page.getByText('Non-members will see a');
console.log('owner: join-org hint count', await hint.count());
console.log('--- explainer text ---');
console.log((await diff.locator('..').innerText().catch(() => '')).slice(0, 400));
await visGroup.scrollIntoViewIfNeeded();
await shot('owner-edit');

// ---- Persona B: the outsider
await logout();
await uiLogin(outsider.email, outsider.password);
await gotoReady(`/org/${org.slug}`);
const eventsSection = page.locator('section[aria-labelledby="events-heading"]');
await eventsSection.waitFor({ timeout: 15000 });
await eventsSection.getByRole('link', { name: /Open Rehearsal/ }).first().waitFor({ timeout: 15000 });
const cardNames = async () => {
	const links = eventsSection.getByRole('link', { name: /Open Rehearsal|Members' Night|Committee Meeting/ });
	const n = await links.count();
	const out = [];
	for (let i = 0; i < n; i++) out.push((await links.nth(i).getAttribute('aria-label'))?.split(' by ')[0]);
	return out;
};
console.log('outsider org page cards:', await cardNames());
console.log('outsider: events heading', await box(vis(page.getByRole('heading', { name: 'Events' }))));
console.log('outsider: Join button count', await page.getByRole('button', { name: /^Join / }).count(), 'link', await page.getByRole('link', { name: /^Join / }).count());
console.log('--- org page main text (600) ---');
console.log((await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 600));
const tbd = await page.getByText('Location TBD').count() + await eventsSection.getByText('TBD', { exact: true }).count();
console.log('outsider: TBD count on cards', tbd);
if (tbd) throw new Error('cards still read TBD');
await shot('outsider-org');
const nightLink = eventsSection.getByRole('link', { name: /Members' Night/ }).first();
console.log('outsider: Members Night card link', await box(nightLink));
await nightLink.click();
await page.waitForURL(new RegExp(events.night.path.replace(/[/']/g, (c) => (c === '/' ? '\\/' : "'"))), { timeout: 15000 }).catch(() => undefined);
console.log('outsider: url after click', page.url());
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
const status = page.getByRole('status').filter({ hasText: /member/i }).first();
await status.waitFor({ timeout: 15000 });
console.log('--- outsider eligibility status ---');
console.log((await status.innerText()).replace(/\n+/g, ' | '));
console.log('outsider: status box', await box(status));
const join = page.getByRole('button', { name: 'Join Organization' });
console.log('outsider: Join Organization button count', await join.count(), await box(vis(join)));
console.log('outsider: RSVP yes count', await page.getByRole('button', { name: "RSVP Yes - I'm attending" }).count());
console.log('outsider: Location TBD count', await page.getByText('Location TBD').count());
await shot('outsider-night');

// ---- Persona C: the member
await logout();
await uiLogin(member.email, member.password);
await gotoReady(`/org/${org.slug}`);
await eventsSection.getByRole('link', { name: /Committee Meeting/ }).first().waitFor({ timeout: 15000 });
console.log('member org page cards:', await cardNames());
console.log('--- member org page main text (400) ---');
console.log((await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 400));
await shot('member-org');
const nightLink2 = eventsSection.getByRole('link', { name: /Members' Night/ }).first();
await nightLink2.click();
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
const yes = vis(page.getByRole('button', { name: "RSVP Yes - I'm attending" }));
await yes.waitFor({ timeout: 15000 });
console.log('member: RSVP Yes button', await box(yes));
console.log('member: "Will you attend?"', await page.getByText('Will you attend?').count());
const memberStatus = page.getByRole('status').first();
console.log('member: status text:', (await memberStatus.innerText().catch(() => 'none')).replace(/\n+/g, ' | ').slice(0, 200));
await shot('member-night');
await yes.click();
const dialog = page.getByRole('dialog');
if (await dialog.isVisible({ timeout: 4000 }).catch(() => false)) {
	console.log('--- rsvp dialog ---');
	console.log((await dialog.innerText()).replace(/\n+/g, ' | ').slice(0, 300));
	const confirm = dialog.getByRole('button', { name: 'RSVP Yes', exact: true });
	console.log('member: confirm button', await box(confirm));
	await confirm.click();
} else {
	console.log('member: no note dialog on this frontend build — RSVP submits directly');
}
// This frontend build submits the RSVP straight away (no note dialog): the
// sidebar swaps the three buttons for a "You're attending" status.
const attending = page.getByRole('status').filter({ hasText: "You're attending" }).first();
await attending.waitFor({ timeout: 15000 });
console.log('member: attending status', await box(attending), '| Change RSVP buttons', await page.getByRole('button', { name: 'Change RSVP' }).count());
await shot('member-rsvpd');
const after = await api(`/api/events/${events.night.id}/my-status`, { token: member.token });
console.log('member my-status after RSVP:', JSON.stringify(after).slice(0, 200));

await browser.close();
console.log('PROBE OK');
