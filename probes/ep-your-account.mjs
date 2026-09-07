// Probe for ep-your-account: arranges one fresh user (Noor Haddad) with an
// R S V P to a dressed dinner, then walks every selector the episode touches:
//   /account/profile   — preferred name, pronouns select, language, Save Changes
//   (same page)        — Dietary section → Add Restriction → "Peanuts" / Allergy
//   user menu          — the avatar button → Settings / Security / Privacy & Data
//   /account/settings  — Digest Settings → Daily → Save Changes
//   /account/security  — Enable 2FA → QR code + "Can't scan? Enter manually"
//   /account/privacy   — Request Data Export, Danger Zone → Delete My Account (hover)
// Verifies through the API that the profile, restriction and digest stuck.
import { chromium } from 'playwright';
import { api, createDressedOrg, createEvent, registerVerifiedUser, rsvpYes } from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SHOTS = process.env.SHOT_DIR || '/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-your-account';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const ADDRESS = 'Schwedenplatz 2, 1010 Vienna, Austria';

// ---- Arrange
const org = await createDressedOrg({
	name: 'Donaukanal Supper Club',
	description:
		'A long table by the canal, once a month. Someone cooks, everyone brings something, nobody leaves hungry. Dietary needs are taken seriously — tell us once and we plan around them.',
	address: ADDRESS
});
const event = await createEvent(org.slug, org.owner.token, {
	name: 'Long Table Dinner, September',
	description:
		'Thirty seats along one table under the plane trees. Mains are cooked on site; bring a salad, a bread or a dessert. We read every dietary note before we shop.',
	requires_ticket: false,
	max_attendees: 30,
	address: ADDRESS
});
const noor = await registerVerifiedUser('noor-haddad', 'Noor', 'Haddad', { emailLocal: 'noor.haddad' });
await rsvpYes(event.id, noor.token);
log('arranged', org.slug, event.path, '| user', noor.email);

// ---- UI walk
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
// Sign in and let the session SETTLE: uiLogin returns the moment the URL is
// /dashboard while the dashboard's auth bootstrap is still rotating the refresh
// token. Leaving mid-rotation strands a dead cookie and the next page reads as
// logged out. The bell means the rotated cookie is stored.
async function loginSettled(p, email, password) {
	await uiLogin(p, email, password);
	await waitAuth(p);
}
// A miss may have cleared the cookies, so each retry signs in again.
async function gotoAuthed(path, creds) {
	for (let attempt = 0; ; attempt++) {
		if (attempt > 0 || !(await page.getByRole('button', { name: 'Open notifications' }).isVisible().catch(() => false))) {
			await loginSettled(page, creds.email, creds.password).catch(() => undefined);
		}
		await gotoReady(path);
		const ok = await waitAuth(page).then(() => true, () => false);
		if (ok) return;
		log(`client auth missed on ${path} (attempt ${attempt + 1}); url now ${page.url().replace(BASE, '')}`);
		if (attempt >= 3) throw new Error(`client auth never landed on ${path}`);
		await page.waitForTimeout(8000 + attempt * 4000);
	}
}
/** Open the avatar menu and click a menu item — the in-app route between account pages. */
async function viaUserMenu(label, urlRe) {
	const trigger = page.getByRole('button', { name: 'User menu' }).filter({ visible: true }).first();
	await trigger.waitFor({ timeout: 10000 });
	await trigger.click();
	const item = page.getByRole('menuitem', { name: label, exact: true });
	await item.waitFor({ timeout: 5000 });
	log(`user menu open; items: ${(await page.getByRole('menuitem').allInnerTexts()).map((s) => s.trim()).join(' · ')}`);
	await item.click();
	await page.waitForURL(urlRe, { timeout: 15000 });
	await page.waitForLoadState('networkidle').catch(() => undefined);
	log(`→ ${page.url().replace(BASE, '')}`);
}

await loginSettled(page, noor.email, noor.password);

// ---- 1. Profile
await gotoAuthed('/account/profile', noor);
const preferred = page.locator('#preferred_name');
const pronounSelect = page.locator('#pronouns-select');
const language = page.locator('#language');
log('profile: h1 =', await page.getByRole('heading', { level: 1 }).first().innerText().catch(() => 'n/a'),
	'| preferred_name =', await preferred.count(), '| pronouns-select =', await pronounSelect.count(), '| language =', await language.count(),
	'| email shown =', await page.locator('#email').inputValue().catch(() => 'n/a'));
const pronounOptions = await pronounSelect.locator('option').allInnerTexts();
log('pronoun options:', pronounOptions.join(' · '));
await shot('profile-top');
await preferred.click();
await preferred.pressSequentially('Noor', { delay: 60 });
await pronounSelect.selectOption('she/her');
await language.hover();
log('typed preferred =', await preferred.inputValue(), '| pronouns =', await pronounSelect.inputValue());
const saveProfile = page.getByRole('button', { name: 'Save Changes' }).first();
log('Save Changes buttons on page:', await page.getByRole('button', { name: 'Save Changes' }).count());
await saveProfile.click();
await page.getByText('Profile updated successfully').waitFor({ timeout: 15000 });
log('profile saved; header display name now:', await page.getByRole('button', { name: 'User menu' }).filter({ visible: true }).first().innerText().catch(() => 'n/a'));
await shot('profile-saved');

// ---- 2. Dietary restriction (same page, further down)
const dietary = page.locator('#dietary-section');
await dietary.scrollIntoViewIfNeeded();
const dietaryBox = await dietary.boundingBox();
log('dietary section top (page px):', dietaryBox ? Math.round(dietaryBox.y + (await page.evaluate(() => window.scrollY))) : 'n/a');
const addRestriction = page.getByRole('button', { name: 'Add Restriction', exact: true }).filter({ visible: true });
log('Add Restriction buttons:', await addRestriction.count(), '| empty state text:', await page.getByText('No dietary restrictions added yet').count());
await shot('dietary-before');
await addRestriction.first().click();
const dlg = page.getByRole('dialog').filter({ has: page.locator('#food-item-name') });
await dlg.waitFor({ timeout: 10000 });
log('restriction dialog title:', await dlg.getByRole('heading').first().innerText());
const food = dlg.locator('#food-item-name');
await food.click();
await food.pressSequentially('Peanuts', { delay: 70 });
await page.waitForTimeout(1200);
const suggestions = dlg.locator('[role="listbox"] [role="option"]');
log('food suggestions:', await suggestions.count(), (await suggestions.allInnerTexts()).join(' · '));
if (await suggestions.count()) await suggestions.first().click();
log('selected note:', await dlg.getByText(/Selected from existing|Will create new/).first().innerText().catch(() => 'n/a'));
const severity = dlg.locator('#restriction-type');
await severity.selectOption('allergy');
log('severity options:', (await severity.locator('option').allInnerTexts()).join(' · '), '| chosen:', await severity.inputValue());
await shot('dietary-dialog');
await dlg.getByRole('button', { name: 'Add Restriction', exact: true }).click();
await dlg.waitFor({ state: 'hidden', timeout: 15000 });
await page.getByText('Peanuts').filter({ visible: true }).first().waitFor({ timeout: 10000 });
const restrictionList = page.locator('#dietary-section ul[role="list"]').last();
log('restriction list now:', (await restrictionList.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200));
await shot('dietary-added');

// ---- 3. Settings → digest
await viaUserMenu('Settings', /\/account\/settings/);
await waitAuth(page);
const digestHeading = page.getByText('Digest Settings').first();
await digestHeading.waitFor({ timeout: 15000 });
await digestHeading.scrollIntoViewIfNeeded();
log('digest: heading', await digestHeading.count(), '| radios:', (await page.getByRole('radio').allInnerTexts()).length, '| ids:', await page.locator('#freq-immediate, #freq-hourly, #freq-daily, #freq-weekly').count());
const daily = page.locator('#freq-daily');
log('freq-daily role/aria-checked before:', await daily.getAttribute('role'), await daily.getAttribute('aria-checked'));
await daily.click();
log('freq-daily aria-checked after:', await daily.getAttribute('aria-checked'), '| send-time visible:', await page.locator('#digest-time').isVisible().catch(() => false), '| value:', await page.locator('#digest-time').inputValue().catch(() => 'n/a'), '| validation error:', await page.getByText('Please enter a valid time').count());
// The API hands back "09:00:00" and the form's HH:MM check rejects it, so the
// Save button stays disabled with a red line under the picker. Retyping the
// time clears it (and is a natural beat: "at nine in the morning").
await page.locator('#digest-time').fill('09:00');
log('after retyping time — validation error:', await page.getByText('Please enter a valid time').count());
await shot('settings-digest');
const saveButtons = page.getByRole('button', { name: 'Save Changes' });
log('Save Changes buttons on settings:', await saveButtons.count(), '| enabled:', await saveButtons.last().isEnabled());
await saveButtons.last().click();
await page.getByText('Notification preferences updated successfully').waitFor({ timeout: 15000 });
log('digest saved');
await shot('settings-saved');

// ---- 4. Security → Enable 2FA
await viaUserMenu('Security', /\/account\/security/);
await waitAuth(page);
const enable = page.getByRole('button', { name: 'Enable 2FA' });
await enable.waitFor({ timeout: 15000 });
log('security: h1 =', await page.getByRole('heading', { level: 1 }).first().innerText().catch(() => 'n/a'), '| Enable 2FA =', await enable.count(), '| status badge Disabled =', await page.getByText('Disabled', { exact: true }).count());
await shot('security-before');
await enable.click();
const qr = page.getByRole('img', { name: 'QR code for 2FA setup' });
await qr.waitFor({ timeout: 20000 });
log('QR code img visible:', await qr.isVisible(), '| setup title:', await page.getByText('Set up Two-Factor Authentication').count());
const cantScan = page.getByText("Can't scan? Enter manually");
log("Can't scan summary:", await cantScan.count());
await cantScan.click();
const secret = page.locator('details code').first();
log('manual secret:', await secret.innerText().catch(() => 'n/a'));
const qrBox = await qr.boundingBox();
log('QR box:', qrBox && { y: Math.round(qrBox.y), h: Math.round(qrBox.height) }, '| scrollY', await page.evaluate(() => window.scrollY));
await shot('security-qr');

// ---- 5. Privacy → export + danger zone
await viaUserMenu('Privacy & Data', /\/account\/privacy/);
await waitAuth(page);
const exportBtn = page.getByRole('button', { name: 'Request Data Export' });
await exportBtn.waitFor({ timeout: 15000 });
log('privacy: h1 =', await page.getByRole('heading', { level: 1 }).first().innerText().catch(() => 'n/a'), '| export btn', await exportBtn.count());
await shot('privacy-top');
await exportBtn.hover();
await exportBtn.click();
const exportResult = page.getByText(/Data export request received|Failed to request|once every 24 hours/).first();
await exportResult.waitFor({ timeout: 20000 });
log('export result:', await exportResult.innerText());
await shot('privacy-exported');
const deleteBtn = page.getByRole('button', { name: 'Delete My Account' });
await deleteBtn.scrollIntoViewIfNeeded();
await deleteBtn.hover();
const delBox = await deleteBtn.boundingBox();
log('Delete My Account:', await deleteBtn.count(), '| box y', delBox && Math.round(delBox.y), '| scrollY', await page.evaluate(() => window.scrollY), '| page height', await page.evaluate(() => document.body.scrollHeight));
log('Danger Zone heading:', await page.getByText('Danger Zone').count());
await shot('privacy-danger');

await browser.close();

// ---- API verification
const me = await api('/api/account/me', { token: noor.token });
log('API me: preferred_name =', me.preferred_name, '| pronouns =', me.pronouns, '| totp_active =', me.totp_active);
if (me.preferred_name !== 'Noor' || me.pronouns !== 'she/her') throw new Error('profile save did not stick');
const restrictions = await api('/api/dietary/restrictions', { token: noor.token });
const rlist = restrictions.results ?? restrictions.items ?? restrictions;
log('API restrictions:', JSON.stringify(rlist).slice(0, 300));
if (!JSON.stringify(rlist).toLowerCase().includes('peanut')) throw new Error('restriction did not stick');
const prefs = await api('/api/notification-preferences', { token: noor.token });
log('API digest_frequency =', prefs.digest_frequency);
if (prefs.digest_frequency !== 'daily') throw new Error('digest did not stick');
if (me.totp_active) throw new Error('2FA must NOT be active (setup only)');

console.log(JSON.stringify({ org: org.slug, event: event.path, user: noor.email }));
console.log('PROBE PASSED');
