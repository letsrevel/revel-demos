// Probe for ep-recurring-events: arranges a life-drawing club (with a city, so
// the wizard's City field is pre-filled), then walks every selector the episode
// touches — the recurring-series wizard's two steps (template event: name,
// start, end, address; recurrence: weekly on Thursday, auto-publish, create),
// the series dashboard with its generated occurrences, and a fresh follower on
// the public series page pressing Follow. Verifies through the API that the
// occurrences were generated and published, and that the follow landed.
//   node probes/ep-recurring-events.mjs
import { chromium } from 'playwright';
import { api, createDressedOrg, registerVerifiedUser } from '../demos/arrange-lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SHOTS =
	process.env.SHOTS ||
	'/private/tmp/claude-501/-Users-biagio-repos-letsrevel-revel-demos/141d34f9-b38f-4e73-a33f-a802b3cdacfc/scratchpad/ep-recurring-events';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const ADDRESS = 'Atelier Lange Gasse, Lange Gasse 34, 1080 Vienna, Austria';
const ORG_DESCRIPTION =
	'An open life-drawing group in Vienna. One long pose a week, a model, good light, and no teacher — bring your own paper and whatever you like to draw with. Beginners are very welcome.';
const EVENT_NAME = 'Long Pose Thursday';
const SERIES_DESCRIPTION =
	'Our weekly long-pose session. One model, two and a half hours, easels provided. Just say you’re coming.';

async function freeOrgName() {
	const districts = ['Josefstadt', 'Neubau', 'Wieden', 'Margareten', 'Mariahilf', 'Alsergrund', 'Landstraße', 'Leopoldstadt', 'Ottakring', 'Hernals'];
	for (const d of districts) {
		const name = `${d} Life Drawing`;
		const found = await api(`/api/organizations/?search=${encodeURIComponent(name)}&page_size=5`);
		if (!(found.results ?? []).some((o) => o.name === name)) return name;
	}
	return 'Vienna Life Drawing';
}

// ---- Arrange
const org = await createDressedOrg({ name: await freeOrgName(), description: ORG_DESCRIPTION, address: ADDRESS });
const vienna = (await api('/api/cities/?search=Vienna&page_size=1')).results?.[0];
if (!vienna) throw new Error('no Vienna in /api/cities');
await api(`/api/organization-admin/${org.slug}`, {
	method: 'PUT',
	token: org.owner.token,
	body: { visibility: 'public', accept_membership_requests: true, description: ORG_DESCRIPTION, address: ADDRESS, city_id: vienna.id }
});
const orgCheck = await api(`/api/organization-admin/${org.slug}`, { token: org.owner.token });
const noor = await registerVerifiedUser('noor-haddad', 'Noor', 'Haddad', { emailLocal: 'noor.haddad' });
log('arranged', org.name, org.slug, 'city:', orgCheck.city?.name ?? '(none)', '| follower:', noor.email);

// Next Thursday at least a week out, 19:00 local.
const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const start = new Date(Date.now() + 7 * 24 * 3600 * 1000);
while (start.getDay() !== 4) start.setDate(start.getDate() + 1);
start.setHours(19, 0, 0, 0);
const end = new Date(start.getTime() + 2.5 * 3600 * 1000);

// ---- Owner UI walk
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const hydrated = (p) => p.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
const bell = (p) => p.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
const shot = (n) => page.screenshot({ path: `${SHOTS}/probe-${n}.png` });

async function uiLogin(p, email, password) {
	await p.goto(BASE + '/login');
	await hydrated(p);
	const reveal = p.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
	await p.getByLabel('Email address').fill(email);
	await p.getByLabel('Password', { exact: true }).fill(password);
	await p.getByRole('button', { name: 'Sign in', exact: true }).click();
	await p.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
	// Let the dashboard's client bootstrap finish rotating the refresh token
	// BEFORE navigating away: leaving 80ms after login made the next page
	// refresh with the already-rotated cookie, 401, and drop the session.
	await bell(p);
	await p.waitForTimeout(800);
}

await uiLogin(page, org.owner.email, org.owner.password);
const wizardPath = `/org/${org.slug}/admin/event-series/new-recurring`;
// Client auth can miss once on a busy shared stack (the header stays
// "Login / Sign Up" over the owner's own form); a reload is cheap off camera.
for (let attempt = 0; ; attempt++) {
	await page.goto(BASE + wizardPath);
	await hydrated(page);
	await page.waitForLoadState('networkidle').catch(() => undefined);
	const ok = await bell(page).then(() => true, () => false);
	log(`wizard landing attempt ${attempt}: auth ${ok ? 'OK' : 'MISSING'}`, page.url());
	if (ok) break;
	if (attempt >= 3) throw new Error('client auth never landed on the wizard page');
	await page.waitForTimeout(4000);
}
await page.locator('#event-name').waitFor({ timeout: 20000 });
log('wizard: heading', await page.getByRole('heading', { name: 'Create recurring series' }).count(), '| step A heading', await page.getByRole('heading', { name: 'Template event' }).count());
await shot('1-wizard');

// Step A: template event.
await page.locator('#event-name').pressSequentially(EVENT_NAME, { delay: 20 });
await page.locator('#event-start').fill(local(start));
await page.locator('#event-end').fill(local(end));
log('start:', await page.locator('#event-start').inputValue(), 'end:', await page.locator('#event-end').inputValue(), '| anchor helper:', await page.getByText('anchor date for the recurrence').count());
const addAddress = page.getByRole('button', { name: /Add Address/ });
log('Add Address card:', await addAddress.count());
await addAddress.scrollIntoViewIfNeeded();
await addAddress.click();
const addr = page.locator('#location-address');
await addr.waitFor({ timeout: 10000 });
log('city prefilled (Vienna visible):', await page.getByText('Vienna').filter({ visible: true }).count(), '| city search input:', await page.locator('#city-search').count());
await addr.pressSequentially(ADDRESS, { delay: 5 });
log('address value:', await addr.inputValue());
await shot('2-step-a-filled');
const cont = page.getByRole('button', { name: 'Continue', exact: true });
log('Continue button:', await cont.count());
await cont.scrollIntoViewIfNeeded();
await cont.click();

// Step B: recurrence.
const seriesName = page.locator('#series-name');
await seriesName.waitFor({ timeout: 10000 });
log('step B heading:', await page.getByRole('heading', { name: 'Recurrence & series settings' }).count(), '| series name prefilled:', await seriesName.inputValue());
const err = page.locator('[role="alert"]').filter({ hasText: /fix|check|required/i });
log('validation banner after Continue:', await err.count());
await page.locator('#series-description').fill(SERIES_DESCRIPTION);
const weekly = page.getByRole('radio', { name: 'Weekly' });
const thursday = page.getByRole('button', { name: 'Thursday', exact: true });
log('Weekly checked:', await weekly.getAttribute('aria-checked'), '| Thursday pressed:', await thursday.getAttribute('aria-pressed'), '| Ends Never checked:', await page.getByRole('radio', { name: 'Never' }).getAttribute('aria-checked').catch(() => '?'), await page.getByRole('radio', { name: 'Never' }).getAttribute('data-state').catch(() => '?'));
log('summary:', (await page.getByText(/^Every /).filter({ visible: true }).allInnerTexts()).join(' | '));
const advanced = page.getByRole('button', { name: 'Advanced', exact: true });
log('Advanced toggle:', await advanced.count(), 'expanded:', await advanced.getAttribute('aria-expanded'));
await advanced.scrollIntoViewIfNeeded();
await advanced.click();
const autoPublish = page.locator('#auto-publish');
await autoPublish.waitFor({ timeout: 10000 });
log('auto-publish role/state:', await autoPublish.getAttribute('role'), await autoPublish.getAttribute('aria-checked'), await autoPublish.getAttribute('data-state'));
await autoPublish.click();
log('auto-publish after click:', await autoPublish.getAttribute('aria-checked'), await autoPublish.getAttribute('data-state'), '| helper:', await page.getByText('New dates go live the moment they are created.').count());
log('generation window:', await page.locator('#generation-window').inputValue(), '| helper:', await page.getByText(/scheduled up to \d+ weeks ahead/).count());
await shot('3-step-b');
const create = page.getByRole('button', { name: 'Create series', exact: true });
log('Create series button:', await create.count());
await create.scrollIntoViewIfNeeded();
await create.click();
await page.waitForURL(/\/admin\/event-series\/[0-9a-f-]{36}$/, { timeout: 30000 });
const seriesId = page.url().match(/event-series\/([0-9a-f-]{36})$/)[1];
await hydrated(page);
await page.waitForLoadState('networkidle').catch(() => undefined);
await bell(page);
log('dashboard:', page.url());

// Series dashboard.
await page.getByRole('heading', { name: EVENT_NAME }).first().waitFor({ timeout: 15000 });
const rows = page.locator('[data-testid="occurrence-row"]');
await rows.first().waitFor({ timeout: 15000 });
log('occurrence rows:', await rows.count(), '| Active:', await page.getByText('Active', { exact: true }).count(), '| Auto-publish on:', await page.getByText('Auto-publish on').count(), '| Scheduled up to:', (await page.getByText(/Scheduled up to/).allInnerTexts()).join(''));
log('summary line:', (await page.getByText(/^Every /).filter({ visible: true }).allInnerTexts()).join(' | '));
log('first rows:', (await rows.allInnerTexts()).slice(0, 3).map((s) => s.replace(/\s+/g, ' ')));
log('Upcoming tab:', (await page.getByRole('button', { name: /Upcoming occurrences/ }).allInnerTexts()).join(''), '| Published badges:', await page.getByText('Published', { exact: true }).count(), '| Draft badges:', await page.getByText('Draft', { exact: true }).count());
log('toast:', await page.getByText(/Series .* created/).count());
await shot('4-dashboard');

// ---- API verification
const detail = await api(`/api/organization-admin/${org.slug}/event-series/${seriesId}`, { token: org.owner.token });
log('API series:', detail.name, detail.slug, '| auto_publish', detail.auto_publish, '| window', detail.generation_window_weeks, '| last_generated_until', detail.last_generated_until, '| rule', detail.recurrence_rule?.rrule_string);
const occ = await api(`/api/events/?event_series=${seriesId}&include_past=false&order_by=start&page_size=100`, { token: org.owner.token });
const real = (occ.results ?? []).filter((e) => !e.is_template);
log('API occurrences:', real.length, 'statuses:', [...new Set(real.map((e) => e.status))], '| first start:', real[0]?.start, '| address:', real[0]?.address);
if (real.length < 5) throw new Error(`expected >= 5 occurrences, got ${real.length}`);
if (real.some((e) => e.status !== 'open')) throw new Error('not all occurrences are published');
const template = await api(`/api/organization-admin/${org.slug}/event-series/${seriesId}/template-event`, { token: org.owner.token });
log('template:', template.name, template.status, template.address, 'city', template.city?.name ?? template.city_id);
const seriesPath = `/events/${org.slug}/series/${detail.slug}`;

// ---- Follower UI walk
const side = await context.newPage();
await side.goto(BASE + '/logout');
await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
await side.close();
await uiLogin(page, noor.email, noor.password);
await page.goto(`${BASE}${seriesPath}?order_by=start`);
await hydrated(page);
await page.waitForLoadState('networkidle').catch(() => undefined);
await bell(page);
log('series page heading:', await page.getByRole('heading', { name: EVENT_NAME }).filter({ visible: true }).count(), '| Event Series badge:', await page.getByText('Event Series').filter({ visible: true }).count());
log('events heading:', (await page.getByRole('heading', { name: /Events|Upcoming/ }).filter({ visible: true }).allInnerTexts()).join(' | '), '| count line:', (await page.getByText(/\d+ events?/).filter({ visible: true }).allInnerTexts()).join(' | '));
const cards = page.locator('a[href*="/events/"]').filter({ hasText: EVENT_NAME });
log('event cards linking to occurrences:', await cards.count(), '| Location TBD:', await page.getByText('Location TBD').count(), '| sort label:', (await page.getByText(/Oldest first|Newest first/).allInnerTexts()).join(''));
const follow = page.getByRole('button', { name: 'Follow', exact: true });
await follow.waitFor({ timeout: 15000 });
log('Follow button:', await follow.count(), await follow.innerText());
await shot('5-series-public');
await follow.click();
const following = page.getByRole('button', { name: 'Following', exact: true });
await following.waitFor({ timeout: 15000 });
log('Following button:', await following.innerText(), '| toast:', await page.getByText(/You are now following/).count());
await shot('6-following');
const status = await api(`/api/event-series/${seriesId}/follow`, { token: noor.token });
log('API follow status:', JSON.stringify(status));
if (!status.is_following) throw new Error('follow did not land');
await page.mouse.wheel(0, 500);
await page.waitForTimeout(500);
await shot('7-series-scrolled');

await browser.close();
console.log('PROBE PASSED', seriesPath, seriesId);
