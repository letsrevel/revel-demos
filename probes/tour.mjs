import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

// login
await page.goto(BASE + '/login');
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
const reveal = page.getByRole('button', { name: 'Show login form' });
if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) {
	console.log('demo-mode login toggle: present');
	await reveal.click();
} else {
	console.log('demo-mode login toggle: absent');
}
await page.getByLabel('Email address').fill('charlie.member@example.com');
await page.getByLabel('Password', { exact: true }).fill('password123');
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
console.log('login: OK ->', page.url());

// nav to events + search
await page.goto(BASE + '/');
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
console.log('client auth: OK');
await page.getByRole('link', { name: 'Browse Events' }).first().click();
await page.waitForURL(/\/events(\?|$)/, { timeout: 15000 });
const search = page.getByRole('searchbox', { name: 'Search events' });
await search.click();
await search.fill('Classical');
const card = page.getByRole('link', { name: /Classical Music Evening/ }).first();
await card.waitFor({ state: 'visible', timeout: 10000 });
// The search is debounced: the results list re-renders after the card first
// appears, so clicking immediately hits a node that is about to be replaced
// and the navigation never happens. Let the query settle first.
await page.waitForLoadState('networkidle');
console.log('search + card: OK ->', await card.getAttribute('href'));
await card.click();
await page.waitForURL(/\/events\/.+/, { timeout: 15000 });
console.log('event page: OK ->', page.url());

// seat picker
const pick = page.getByRole('button', { name: 'Pick seats…' }).first();
await pick.waitFor({ state: 'visible', timeout: 15000 });
await pick.click();
const picker = page.getByTestId('seat-picker-dialog');
await picker.waitFor({ state: 'visible', timeout: 10000 });
await picker.getByText('STAGE').waitFor({ timeout: 15000 });
const freeSeats = picker.getByRole('button', { name: /^Seat /, pressed: false, disabled: false });
const n = await freeSeats.count();
console.log('seat picker: OK, free seats visible:', n);
// click two seats like the demo will
for (let i = 0; i < 2; i++) {
	const available = await freeSeats.count();
	if (available === 0) { console.log('no free seats left at pick', i); break; }
	await freeSeats.nth(Math.min(4, available - 1)).click();
	await page.waitForTimeout(1500);
	console.log('picked seat', i + 1, '— free left:', await freeSeats.count());
}

await browser.close();
console.log('PROBE PASSED');
