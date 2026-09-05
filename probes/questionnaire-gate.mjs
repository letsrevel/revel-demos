import { chromium } from 'playwright';
import { arrange } from '../demos/arrange-qgate.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const GUEST = { email: 'hannah.attendee@example.com', password: 'password123' };
const ANSWER =
	"Complete beginner — I've been curious about shibari for a long time and a friend recommended your space. I care about learning safely and can't wait to start.";

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

const { eventPath, questionnaireId, orgSlug, owner } = await arrange();
console.log('arrange: OK', eventPath, '| org:', orgSlug);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

await uiLogin(page, GUEST.email, GUEST.password);
await page.goto(BASE + eventPath);
await waitHydrated(page);
await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
console.log('guest on event page: OK');

await page
	.getByText(/Complete the required questionnaire/)
	.filter({ visible: true })
	.first()
	.waitFor({ timeout: 15000 });
const cta = page.getByRole('button', { name: 'Complete Questionnaire' }).filter({ visible: true }).first();
await cta.click();
await page.waitForURL(/\/questionnaire\//, { timeout: 15000 });
await page.waitForLoadState('networkidle');
console.log('gate + questionnaire page: OK');

const answerBox = page.getByRole('textbox').first();
await answerBox.click();
await answerBox.fill(ANSWER);
await page.getByRole('button', { name: 'Submit Questionnaire' }).click();
await page.waitForURL(new RegExp(eventPath.split('/').pop()), { timeout: 15000 });
console.log('submit: OK');

await page
	.getByText(/being reviewed|under review/i)
	.first()
	.waitFor({ timeout: 10000 });
console.log('pending state: OK');

await switchUser(page, owner.email, owner.password);
await page.goto(BASE + `/org/${orgSlug}/admin/questionnaires/${questionnaireId}/submissions`);
await waitHydrated(page);
await page.waitForLoadState('networkidle');
const row = page
	.locator('tbody tr, div.bg-card')
	.filter({ hasText: 'Hannah' })
	.filter({ visible: true })
	.first();
await row.waitFor({ timeout: 15000 });
console.log('admin submissions row: OK');

await row.getByRole('link', { name: 'Review' }).click();
await page.getByRole('heading', { name: 'Review Submission' }).waitFor({ timeout: 15000 });
await page.getByRole('button', { name: 'Approve' }).click();
await page.getByRole('button', { name: /Approve/ }).getByText('Current').waitFor({ timeout: 15000 });
console.log('approve: OK');

await switchUser(page, GUEST.email, GUEST.password);
await page.goto(BASE + eventPath);
await waitHydrated(page);
const getTickets = page
	.getByRole('button', { name: 'Get Tickets', exact: true })
	.filter({ visible: true })
	.first();
await getTickets.waitFor({ timeout: 20000 });
await getTickets.click();
await page.waitForTimeout(1500);
console.log('get tickets active + clickable: OK');

await browser.close();
console.log('PROBE PASSED');
