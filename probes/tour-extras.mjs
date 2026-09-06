// Selector walk for the four new tour clips. Run before every render:
//   node probes/tour-extras.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
const S = process.env.SHOTS;
let fails = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${m}`); if (!c) fails++; };

async function login(email) {
  await ctx.clearCookies();
  await page.goto(BASE + '/login');
  await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' });
  const t = page.getByRole('button', { name: 'Show login form' });
  if (await t.isVisible({ timeout: 3000 }).catch(() => false)) await t.click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 20000 });
  await page.getByRole('button', { name: 'Open notifications' }).waitFor({ timeout: 20000 });
}
async function go(p) {
  await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
  await page.locator('body[data-hydrated="true"]').waitFor({ state: 'attached' }).catch(()=>{});
  await page.addStyleTag({ content: 'div[role="alert"]:has(a[href*="mailpit"]){display:none!important}' }).catch(()=>{});
  await page.waitForLoadState('networkidle').catch(()=>{});
  await page.waitForTimeout(900);
}

console.log('\n== A: members-only form + membership admin (dario) ==');
await login('dario.owner@demovideo.example.com');
await go('/org/the-velvet-cellar/admin/events/new');
const membersOnly = page.locator('input[type=radio][value="members-only"]').first();
ok(await membersOnly.count() > 0, 'members-only radio exists');
await membersOnly.scrollIntoViewIfNeeded();
await membersOnly.click({ force: true });
await page.waitForTimeout(400);
ok(await membersOnly.isChecked(), 'members-only radio can be selected');
if (S) await page.screenshot({ path: `${S}/A-form.png` });
await go('/org/the-velvet-cellar/admin/members');
ok(await page.getByText('Lena Krause').filter({ visible: true }).count() > 0, 'member row visible');
const tiersTab = page.getByRole('button', { name: /Tiers/ }).or(page.getByRole('tab', { name: /Tiers/ })).filter({ visible: true }).first();
ok(await tiersTab.count() > 0, 'Tiers tab present');
await tiersTab.click(); await page.waitForTimeout(1200);
if (S) await page.screenshot({ path: `${S}/A-tiers.png` });

console.log('\n== B: the gate (noa) ==');
await login('noa.attendee@demovideo.example.com');
await go('/events/shibari-circle-vienna/intro-to-shibari-rope-and-trust');
const gate = page.getByText(/questionnaire|application|apply/i).filter({ visible: true });
ok(await gate.count() > 0, `gate wording present (${await gate.count()} matches)`);
console.log('     first gate texts:', (await gate.allInnerTexts()).slice(0,3).map(s=>s.replace(/\s+/g,' ').trim().slice(0,70)));
if (S) await page.screenshot({ path: `${S}/B-gate.png` });

console.log('\n== B: the queue (ren) ==');
await login('ren.owner@demovideo.example.com');
await go('/org/shibari-circle-vienna/admin/questionnaires');
const qHref = await page.locator('a[href*="/admin/questionnaires/"]').first().getAttribute('href');
ok(!!qHref, `questionnaire href resolved: ${qHref}`);
await go(qHref + '/submissions');
ok(await page.getByText('Pending Review').filter({ visible: true }).count() > 0, 'pending review stat visible');
const pendingChip = page.getByRole('button', { name: 'Pending Review' }).filter({ visible: true }).first();
ok(await pendingChip.count() > 0, 'Pending Review filter chip present');
ok(await page.getByRole('button', { name: 'Review' }).filter({ visible: true }).count() > 0, 'Review buttons present');
if (S) await page.screenshot({ path: `${S}/B-queue.png` });

console.log('\n== D: montage screens (alice) ==');
await login('alice.owner@example.com');
for (const p of ['/org/revel-events-collective/admin/financials','/org/revel-events-collective/admin/venues','/org/revel-events-collective/admin/announcements','/org/revel-events-collective/admin/members']) {
  await go(p);
  const empty = await page.getByText(/no .*(yet|found)|don't have any/i).filter({ visible: true }).count();
  ok(empty === 0, `${p.split('/').pop()} has content`);
}
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nPROBE PASSED');
await browser.close();
process.exit(fails ? 1 : 0);
