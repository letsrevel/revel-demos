// Probe the montage's fourth screen in clip-much-more.
//
// The line promises "every ticket and attendee in one place". The org-wide
// /org/<org>/admin/tickets page does not deliver it — it is only an event
// picker ("Select an event to manage its tickets"), with no ticket and no
// attendee on screen. This walks the replacement: the busiest seeded event's
// own admin ticket list, resolved by slug the same way the demo resolves it,
// and reports what is actually in frame at the scroll the demo uses.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const API = process.env.API_URL || 'http://localhost:8000';
const ORG = 'revel-events-collective';
const EVENT_SLUG = 'classical-music-evening';
const SCROLL = 0; // must match MONTAGE[3].scroll in demos/clip-much-more.demo.ts

const res = await fetch(`${API}/api/events/${ORG}/event/${EVENT_SLUG}`);
if (!res.ok) throw new Error(`event ${EVENT_SLUG} not found (${res.status}) — reseed?`);
const event = await res.json();
console.log(`event: ${event.name} (${event.id})`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
context.setDefaultTimeout(15_000);

await page.goto(BASE + '/login');
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
const reveal = page.getByRole('button', { name: 'Show login form' });
if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();
await page.getByLabel('Email address').fill('alice.owner@example.com');
await page.getByLabel('Password', { exact: true }).fill('password123');
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20_000 });

await page.goto(`${BASE}/org/${ORG}/admin/events/${event.id}/tickets`);
await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
await page.addStyleTag({ content: 'div[role="alert"]:has(a[href*="mailpit"]){display:none!important}' });
await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20_000 });
await page.waitForLoadState('networkidle').catch(() => undefined);
await page.waitForTimeout(1500);

const heading = await page.getByRole('heading', { name: 'Manage Tickets' }).first().innerText();
const rows = await page.locator('table tbody tr').count();
const counters = await page.locator('main').first().innerText();
const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
console.log('heading      :', heading);
console.log('ticket rows  :', rows, '(expect ~42 + header)');
console.log('scrollable px:', scrollable, `(demo holds at ${SCROLL} — the counts header is the shot)`);
console.log('counters     :', (counters.match(/\d+\s*\n\s*(Total \(page\)|Pending|Active|Checked In|Cancelled)/g) || []).join(' | ').replace(/\s+/g, ' '));
console.log('banner hidden:', (await page.locator('div[role="alert"]:has(a[href*="mailpit"])').isVisible().catch(() => false)) === false);

const dir = process.env.SHOT_DIR || '/tmp';
await page.evaluate((y) => window.scrollTo({ top: y }), SCROLL);
await page.waitForTimeout(700);
await page.screenshot({ path: `${dir}/much-more-tickets-${SCROLL}.png` });
console.log('shot         :', `${dir}/much-more-tickets-${SCROLL}.png`);
const framed = await page.locator('main').first().innerText();
for (const want of ['Manage Tickets', 'Total earned', 'Total (page)', 'Pending', 'Active', 'Checked In']) {
	console.log(`  in frame? ${want.padEnd(14)} ${framed.includes(want) ? 'yes' : 'NO'}`);
}

await browser.close();
