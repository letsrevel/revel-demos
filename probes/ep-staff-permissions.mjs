// Probe for ep-staff-permissions: arranges a small theatre org with one
// free-ticketed event (four ticket holders, so the door list is not an empty
// state) and one member with a human name, then walks every selector the
// episode touches:
//   owner  — members page → "Manage <name>" → "Make Staff Member" → confirm →
//            Staff tab → "Edit permissions for <name>" → untick down to
//            check-in + manage tickets → Save Changes
//   staff  — /admin dashboard (Staff badge, notice), /admin/tickets (redirects
//            to the event's door list), /admin/members and /admin/settings
//            (whatever the app actually does — printed, not assumed)
// Verifies through the API that the grant stuck (staff list + my-permissions).
import { chromium } from 'playwright';
import {
	api,
	createDressedOrg,
	createEvent,
	registerVerifiedUser,
	makeMember,
	defaultMembershipTier,
	createTier,
	deleteDefaultTier
} from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SHOTS = process.env.SHOT_DIR || '/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-staff-permissions';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const ADDRESS = 'Kellertheater, Schleifmühlgasse 12, 1040 Vienna, Austria';

async function freeOrgName() {
	const districts = ['Wieden', 'Neubau', 'Josefstadt', 'Margareten', 'Mariahilf', 'Alsergrund', 'Landstraße', 'Leopoldstadt', 'Ottakring', 'Hernals'];
	for (const d of districts) {
		const name = `${d} Kellertheater`;
		const found = await api(`/api/organizations/?search=${encodeURIComponent(name)}&page_size=5`);
		if (!(found.results ?? []).some((o) => o.name === name)) return name;
	}
	return 'Kellertheater Collective';
}

// ---- Arrange
const org = await createDressedOrg({
	name: await freeOrgName(),
	description:
		'A forty-seat cellar theatre run by the people who perform in it. Cabaret, small plays, the occasional very late poetry night. Tickets are free or cheap; the bar keeps the lights on.',
	address: ADDRESS
});
const event = await createEvent(org.slug, org.owner.token, {
	name: 'Autumn Cabaret Night',
	description:
		'Four acts, one piano, and a bar that opens at seven. Doors at half seven, first act at eight. Free entry — grab a ticket so we know how many chairs to put out.',
	max_attendees: 40,
	address: ADDRESS
});
log('arranged', org.slug, event.path, event.id);

// The auto-created default tier is `offline`: its tickets sit as "Pending" on
// the door list. Replace it with a free one so the list reads as issued tickets.
await deleteDefaultTier(event.id, org.owner.token);
const tier = await createTier(event.id, org.owner.token, { name: 'Free entry', total_quantity: 40 });
log('tier:', tier?.name, tier?.payment_method, tier?.id);

const HOLDERS = [
	['Lena', 'Hartmann', 'lena.hartmann'],
	['Tomas', 'Berger', 'tomas.berger'],
	['Priya', 'Nair', 'priya.nair'],
	['Elif', 'Demir', 'elif.demir']
];
for (const [first, last, emailLocal] of HOLDERS) {
	const u = await registerVerifiedUser(emailLocal.replace('.', '-'), first, last, { emailLocal });
	const res = await api(`/api/events/${event.id}/tickets/${tier.id}/checkout`, {
		token: u.token,
		body: { tickets: [{ guest_name: `${first} ${last}` }] }
	});
	log('ticket:', first, res.tickets?.length, res.requires_payment ? 'REQUIRES PAYMENT ⚠️' : 'issued');
}

const felix = await registerVerifiedUser('felix-brandl', 'Felix', 'Brandl', { emailLocal: 'felix.brandl' });
const mtier = await defaultMembershipTier(org.slug, org.owner.token);
await makeMember(org.slug, felix.token, org.owner.token, mtier.id);
log('member:', felix.email);

// ---- Owner UI walk
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const shot = (name) => page.screenshot({ path: `${SHOTS}/probe-${name}.png` });

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
async function gotoReady(path) {
	await page.goto(BASE + path);
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
	await page.addStyleTag({ content: 'div[role="alert"]:has(a[href*="mailpit"]){display:none!important}' }).catch(() => undefined);
	await page.waitForLoadState('networkidle').catch(() => undefined);
}
// Client auth can miss once on a busy shared stack; off camera a reload is cheap.
async function gotoAuthed(path) {
	for (let attempt = 0; ; attempt++) {
		await gotoReady(path);
		const ok = await waitAuth(page).then(() => true, () => false);
		if (ok) return;
		log(`client auth missed on ${path} (attempt ${attempt + 1}); url now ${page.url().replace(BASE, '')}`);
		await shot(`auth-miss-${attempt}`);
		if (attempt >= 2) throw new Error(`client auth never landed on ${path}`);
		await page.waitForTimeout(4000);
	}
}

await uiLogin(page, org.owner.email, org.owner.password);
const membersPath = `/org/${org.slug}/admin/members`;
await gotoAuthed(membersPath);
await page.getByRole('heading', { name: 'Members & Staff' }).first().waitFor({ timeout: 15000 });
const felixName = `${felix.firstName} ${felix.lastName}`;
const manageBtn = page.getByRole('button', { name: `Manage ${felixName}` });
await manageBtn.waitFor({ timeout: 15000 });
log('members tab: Manage button for Felix:', await manageBtn.count(), '| owner badge:', await page.getByText('Owner', { exact: true }).count());
await shot('owner-members');

await manageBtn.click();
const manageDialog = page.getByRole('dialog');
await manageDialog.waitFor({ timeout: 10000 });
log('manage modal title:', await manageDialog.getByRole('heading').first().innerText());
const makeStaffBtn = manageDialog.getByRole('button', { name: 'Make Staff Member' });
log('Make Staff Member button:', await makeStaffBtn.count());
await shot('owner-manage-modal');
await makeStaffBtn.click();
// No confirm step: the modal's button promotes straight away (default
// permissions) and the modal closes on success.
await manageDialog.waitFor({ state: 'hidden', timeout: 20000 });
await page.waitForTimeout(600);
log('manage modal closed after promotion; open dialogs:', await page.getByRole('dialog').count(),
	'| Staff badge on member card:', await page.getByText('Staff', { exact: true }).filter({ visible: true }).count());
await shot('owner-after-promote');

// Staff tab
await page.getByRole('tab', { name: /^Staff/ }).click();
const editPermsBtn = page.getByRole('button', { name: `Edit permissions for ${felixName}` });
await editPermsBtn.waitFor({ timeout: 15000 });
const staffCardText = (await page.locator('[data-testid], article, div').filter({ has: editPermsBtn }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
log('staff tab: edit button', await editPermsBtn.count(), '| card:', staffCardText.slice(0, 200));
await shot('owner-staff-tab');
await editPermsBtn.click();
const editor = page.getByRole('dialog');
await editor.waitFor({ timeout: 10000 });
log('editor title:', await editor.getByRole('heading').first().innerText());
const KEEP = new Set(['check_in_attendees', 'manage_tickets']);
const boxes = editor.getByRole('checkbox');
const n = await boxes.count();
log('checkboxes in editor:', n);
const initial = {};
for (let i = 0; i < n; i++) {
	const b = boxes.nth(i);
	const id = await b.getAttribute('id');
	const checked = (await b.getAttribute('aria-checked')) === 'true' || (await b.isChecked().catch(() => false));
	initial[id] = checked;
}
log('initial checked:', Object.entries(initial).filter(([, v]) => v).map(([k]) => k).join(', '));
await shot('owner-editor-before');
for (let i = 0; i < n; i++) {
	const b = boxes.nth(i);
	const id = await b.getAttribute('id');
	const checked = (await b.getAttribute('aria-checked')) === 'true';
	const want = KEEP.has(id);
	if (checked !== want) {
		await b.scrollIntoViewIfNeeded();
		await b.click();
	}
}
const after = {};
for (let i = 0; i < n; i++) {
	const b = boxes.nth(i);
	after[await b.getAttribute('id')] = (await b.getAttribute('aria-checked')) === 'true';
}
log('after ticking:', Object.entries(after).filter(([, v]) => v).map(([k]) => k).join(', '));
// Where do the two kept boxes sit — is the Attendee Management group in view when the dialog scrolls?
const checkinLabel = editor.locator('label[for="check_in_attendees"]');
log('check-in label:', await checkinLabel.innerText(), '| manage tickets label:', await editor.locator('label[for="manage_tickets"]').innerText());
await shot('owner-editor-after');
const saveBtn = editor.getByRole('button', { name: 'Save Changes' });
log('save button:', await saveBtn.count());
await saveBtn.click();
await editor.waitFor({ state: 'hidden', timeout: 20000 });
await page.waitForTimeout(800);
const grantedText = await page.getByText(/permissions granted/).first().innerText().catch(() => 'n/a');
log('staff card after save:', grantedText);
await shot('owner-staff-after');

// ---- API verification
const staffList = await api(`/api/organization-admin/${org.slug}/staff?page_size=50`, { token: org.owner.token });
const row = (staffList.results ?? []).find((s) => s.user.email === felix.email);
if (!row) throw new Error('Felix is not in the staff list');
const granted = Object.entries(row.permissions.default).filter(([, v]) => v).map(([k]) => k);
log('API staff permissions.default granted:', granted.join(', '));
if (granted.length !== 2 || !granted.every((k) => KEEP.has(k))) throw new Error(`expected exactly check_in_attendees + manage_tickets, got ${granted}`);
const mine = await api('/api/permissions/my-permissions', { token: felix.token });
const mineOrg = mine.organization_permissions?.[org.id];
log('my-permissions as Felix:', typeof mineOrg === 'string' ? mineOrg : Object.entries(mineOrg?.default ?? {}).filter(([, v]) => v).map(([k]) => k).join(', '));
if (!mineOrg || mineOrg === 'owner' || !mineOrg.default?.check_in_attendees || !mineOrg.default?.manage_tickets || mineOrg.default?.manage_members) throw new Error('my-permissions does not reflect the grant');

// ---- Staff UI walk
const side = await context.newPage();
await side.goto(BASE + '/logout');
await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
await side.close();
await uiLogin(page, felix.email, felix.password);

await gotoAuthed(`/org/${org.slug}/admin`);
log('staff dashboard: badge Staff =', await page.getByText('Staff', { exact: true }).filter({ visible: true }).count(),
	'| notice =', await page.getByText('Staff Member Permissions').count(),
	'| Create Event button =', await page.getByRole('button', { name: 'Create Event' }).count());
const tiles = await page.locator('button h3').allInnerTexts();
log('quick action tiles:', tiles.join(' · '));
const navLabels = await page.locator('nav a').filter({ visible: true }).allInnerTexts();
log('nav (visible links):', navLabels.map((s) => s.trim()).filter(Boolean).join(' · '));
await shot('staff-dashboard');

await gotoReady(`/org/${org.slug}/admin/tickets`);
await waitAuth(page).catch(() => undefined);
log('tickets: url →', page.url().replace(BASE, ''));
const mt = page.getByRole('heading', { name: 'Manage Tickets' }).first();
log('tickets: Manage Tickets heading =', await mt.count(), '| rows =', await page.locator('table tbody tr').count(), '| Access Denied =', await page.getByText('Access Denied').count());
await shot('staff-tickets');

await gotoReady(`/org/${org.slug}/admin/members`);
log('members: url →', page.url().replace(BASE, ''), '| Access Denied =', await page.getByText('Access Denied').count(), '| h1:', await page.getByRole('heading').first().innerText().catch(() => 'n/a'));
log('members: body says:', (await page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 260));
await shot('staff-members');

await gotoReady(`/org/${org.slug}/admin/settings`);
log('settings: url →', page.url().replace(BASE, ''), '| Access Denied =', await page.getByText('Access Denied').count(), '| h1:', await page.getByRole('heading').first().innerText().catch(() => 'n/a'));
log('settings: body says:', (await page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200));
await shot('staff-settings');

await browser.close();
console.log(JSON.stringify({ org: org.slug, event: event.id, felix: felix.email }));
console.log('PROBE PASSED');
