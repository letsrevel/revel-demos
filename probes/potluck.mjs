import { chromium } from 'playwright';
import { arrange, GUEST } from '../demos/arrange-potluck.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

async function waitHydrated(page) {
	await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
}
async function uiLogin(page, email, password) {
	await page.goto(BASE + '/login');
	await waitHydrated(page);
	const reveal = page.getByRole('button', { name: 'Show login form' });
	if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
	await page.getByLabel('Email address').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
}
async function switchUser(page, email, password) {
	const side = await page.context().newPage();
	await side.goto(BASE + '/logout');
	await side.waitForURL(/logged_out/, { timeout: 15000 }).catch(() => undefined);
	await uiLogin(side, email, password);
	await side.close();
}

const { eventPath, owner } = await arrange();
console.log('arrange: OK', eventPath);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
page.on('dialog', (d) => d.dismiss());

await uiLogin(page, GUEST.email, GUEST.password);
await page.goto(BASE + eventPath);
await waitHydrated(page);
await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
await page.waitForLoadState('networkidle');
console.log('guest on event page: OK');

const potluckHeading = page.getByRole('heading', { name: 'Potluck', exact: false }).first();
await potluckHeading.waitFor({ timeout: 15000 });
const potluckHeader = page.locator('section[aria-labelledby="potluck-heading"] button[aria-controls="potluck-content"]');
console.log('potluck header text:', (await potluckHeader.innerText()).replace(/\n/g, ' | '));
console.log('address on page:', await page.getByText('Augarten').first().isVisible());

const yes = page.getByRole('button', { name: 'RSVP Yes - I\'m attending' }).filter({ visible: true }).first();
await yes.waitFor({ timeout: 15000 });
await yes.click();
await page.getByText(/going to|you're going/i).first().waitFor({ timeout: 15000 }).catch(() => undefined);
await page.waitForLoadState('networkidle');
console.log('rsvp yes: OK');

if ((await potluckHeader.getAttribute('aria-expanded')) !== 'true') await potluckHeader.click();
await page.locator('#potluck-content').waitFor({ timeout: 10000 });
console.log('potluck expanded: OK');

const claimBtn = page.getByRole('button', { name: 'Claim Big pot of goulash' });
await claimBtn.waitFor({ timeout: 15000 });
await claimBtn.click();
await page.getByRole('button', { name: 'Unclaim Big pot of goulash' }).waitFor({ timeout: 15000 });
console.log('claim goulash: OK; header now:', (await potluckHeader.innerText()).replace(/\n/g, ' | '));

await page.getByRole('button', { name: "Add item you'll bring" }).click();
await page.locator('#edit-item-name').waitFor({ timeout: 10000 });
await page.locator('#edit-item-name').fill("Grandma's apple strudel");
await page.locator('#edit-item-type').selectOption('dessert');
await page.locator('#edit-quantity').fill('1 tray');
const submitBtns = page.getByRole('dialog').locator('button[type="submit"]');
console.log('form submit label:', await submitBtns.first().innerText());
await submitBtns.first().click();
await page.getByRole('button', { name: "Unclaim Grandma's apple strudel" }).waitFor({ timeout: 15000 });
console.log('add own item: OK; header now:', (await potluckHeader.innerText()).replace(/\n/g, ' | '));

await switchUser(page, owner.email, owner.password);
await page.goto(BASE + eventPath);
await waitHydrated(page);
await page.waitForLoadState('networkidle');
const hostHeader = page.locator('section[aria-labelledby="potluck-heading"] button[aria-controls="potluck-content"]');
await hostHeader.waitFor({ timeout: 15000 });
if ((await hostHeader.getAttribute('aria-expanded')) !== 'true') await hostHeader.click();
await page.getByRole('button', { name: 'Edit Big pot of goulash' }).waitFor({ timeout: 15000 });
console.log('host view with edit controls: OK; header:', (await hostHeader.innerText()).replace(/\n/g, ' | '));
const dietary = page.locator('button[aria-expanded]').filter({ hasText: 'Dietary Information' }).first();
await dietary.waitFor({ timeout: 15000 });
await dietary.click();
await page.getByText('Vegetarian').first().waitFor({ timeout: 10000 });
await page.getByText('Peanuts').first().waitFor({ timeout: 10000 });
const card = dietary.locator('xpath=..');
console.log('dietary summary:', (await card.innerText()).replace(/\s*\n\s*/g, ' | ').slice(0, 400));
console.log('host add button:', await page.getByRole('button', { name: /^Add/ }).first().innerText());

await browser.close();
console.log('PROBE PASSED');
