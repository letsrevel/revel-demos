import { test, withOverlay } from '@argo-video/cli';
import type { Locator, Page } from '@playwright/test';
// @ts-expect-error plain JS shared with probes
import { api, createDressedOrg, createEvent, createTier, deleteDefaultTier, registerVerifiedUser } from './arrange-lib.mjs';
import { glideScroll, uiLogin, switchUser, waitClientAuth } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';

test.use({ bypassCSP: true });

// Episode 15 · "Selling a ticket, start to finish". The organizer creates an
// offline (bank-transfer) tier ON CAMERA, a buyer reserves it and gets a
// pending ticket carrying the instructions, and the organizer confirms the
// payment on the event's ticket list. Two personas, two cuts.
const CARD = {
	episode: 15,
	title: 'Selling a ticket, start to finish',
	pov: 'the organizer, then a buyer'
};

/** The account chrome, bounded — a screen that never arrives is worse than a flash. */
async function settleAuth(page: Page, ms: number): Promise<void> {
	await page
		.getByRole('button', { name: 'Open notifications' })
		.waitFor({ timeout: ms })
		.catch(() => undefined);
}

const visible = (page: Page, role: Parameters<Page['getByRole']>[0], name: string | RegExp) =>
	page.getByRole(role, { name }).filter({ visible: true }).first();

/**
 * Org names are unique, and `createDressedOrg` falls back to "… Studio",
 * "… II" when one is taken — which then reads as test data on camera. Probes
 * and earlier takes leave their orgs behind, so pick the first name whose slug
 * is still free.
 */
async function pickFreeOrgName(candidates: string[]): Promise<string> {
	for (const name of candidates) {
		const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
		const taken = await api(`/api/organizations/${slug}`)
			.then(() => true)
			.catch(() => false);
		if (!taken) return name;
	}
	return candidates[0];
}

/**
 * A native <select>'s popup is an OS widget the recorder never sees. Show the
 * options in-page instead: expand the element into an inline list (freeing the
 * Tailwind fixed height), walk the pointer down the options, then collapse.
 */
async function expandSelect(select: Locator, rows: number): Promise<void> {
	await select.evaluate((el, n) => {
		const s = el as HTMLSelectElement;
		s.size = n as number;
		s.style.height = 'auto';
	}, rows);
}
async function collapseSelect(select: Locator): Promise<void> {
	await select.evaluate((el) => {
		const s = el as HTMLSelectElement;
		s.size = 1;
		s.style.height = '';
	});
}
async function pointAlongOptions(page: Page, select: Locator, rows: number, totalMs: number): Promise<void> {
	const box = await select.boundingBox().catch(() => null);
	if (!box) {
		await page.waitForTimeout(totalMs);
		return;
	}
	const rowH = box.height / rows;
	const per = Math.floor(totalMs / rows);
	for (let i = 0; i < rows; i++) {
		await page.mouse.move(box.x + 120, box.y + rowH * (i + 0.5), { steps: 8 });
		await page.waitForTimeout(per);
	}
}

/** Smooth-scroll a field into the middle of the (scrollable) dialog. */
async function glideIntoDialog(page: Page, target: Locator, ms = 700): Promise<void> {
	await target
		.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
		.catch(() => undefined);
	await page.waitForTimeout(ms);
}

test('ep-selling-a-ticket', async ({ page, narration }) => {
	test.setTimeout(600_000);

	// ---- Arrange (not recorded): a folk club, one night, two tiers already
	// there. The third — Early bird, by bank transfer — is created on camera.
	const orgName = await pickFreeOrgName([
		'Kettle Lane Folk Club',
		'Copper Kettle Folk Club',
		'Back Room Folk Club',
		'Lantern Folk Club',
		'Hollow Oak Folk Club',
		'Fiddlers Green Folk Club'
	]);
	const org = await createDressedOrg({
		name: orgName,
		description:
			'A folk club in the back room of a pub in Mariahilf. Fiddles, a squeezebox, and whoever brought a song. Every second Thursday since 2014, run by volunteers.',
		address: 'Stumpergasse 12, 1060 Vienna, Austria'
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Harvest Night: Songs from the Back Room',
		description:
			'Our autumn session. Three short sets, then the floor is open. Bring an instrument or just your ears. Doors at seven, first tune at half past.',
		address: 'Stumpergasse 12, 1060 Vienna, Austria',
		max_attendees: 60,
		// With names not required, a single fixed-price tier checks out directly:
		// "Buy" reserves and the ticket opens. No sheet to click through.
		require_ticket_names: false
	});
	await deleteDefaultTier(event.id, org.owner.token);
	await createTier(event.id, org.owner.token, {
		name: 'At the door',
		description: 'Pay cash at the door when you arrive. Fifteen euros, no card needed.',
		payment_method: 'at_the_door',
		price: '15.00',
		total_quantity: 30
	});
	await createTier(event.id, org.owner.token, {
		name: 'Volunteers',
		description: 'Free entry for the door and bar crew. Show up an hour early.',
		payment_method: 'free',
		price: '0.00',
		total_quantity: 5
	});
	const buyer = await registerVerifiedUser('buyer', 'Jonas', 'Feldmann', { emailLocal: 'jonas.feldmann' });

	const adminPath = `/org/${org.slug}/admin/events/${event.id}/edit?tab=ticketing`;
	const ticketsPath = `/org/${org.slug}/admin/events/${event.id}/tickets`;
	const INSTRUCTIONS = `Bank transfer to ${orgName}, IBAN AT61 1904 3002 3457 3201, reference your name. We confirm within a day.`;

	// ---- Setup (not recorded): log in as the owner so the first page carries
	// auth, and prime both admin bundles so hydration lands sooner under the cover.
	await uiLogin(page, org.owner.email, org.owner.password);
	await waitClientAuth(page);
	const primer = await page.context().newPage();
	for (const path of [adminPath, ticketsPath]) {
		await primer.goto(path).catch(() => undefined);
		await primer.waitForLoadState('networkidle').catch(() => undefined);
	}
	await primer.close();

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene: the tier form — name, then the payment methods and price types.
	await titleCardCutTo(page, CARD, adminPath);
	await settleAuth(page, 4000);
	await visible(page, 'heading', 'Ticket Tiers').waitFor({ timeout: 10_000 }).catch(() => undefined);
	const addTier = visible(page, 'button', /Add Another Tier/);
	await addTier.waitFor({ timeout: 10_000 }).catch(() => undefined);
	// The add button sits below the two existing cards — glide it into view
	// (silent, so the export speeds it up) before the line starts.
	const addBox = await addTier.boundingBox().catch(() => null);
	if (addBox && addBox.y > 760) await glideScroll(page, addBox.y - 620, 1400);
	await page.waitForTimeout(300);
	narration.mark('tier');
	await withOverlay(page, 'tier', async () => {
		if (await addTier.isVisible().catch(() => false)) {
			await addTier.hover();
			await page.waitForTimeout(500);
			await addTier.click();
		}
		const form = page.getByRole('dialog');
		await form.getByRole('heading', { name: 'Create Ticket Tier' }).waitFor({ timeout: 10_000 }).catch(() => undefined);
		await page.waitForTimeout(500);
		const nameInput = form.locator('#tier-name');
		if (await nameInput.isVisible().catch(() => false)) {
			await nameInput.click();
			await nameInput.pressSequentially('Early bird', { delay: 55 });
		}
		const desc = form.getByRole('textbox', { name: /Description/ });
		if (await desc.isVisible().catch(() => false)) {
			await desc.click();
			await desc.pressSequentially('The first twenty seats, at a friendlier price.', { delay: 18 });
		}
		await page.waitForTimeout(400);
		// The four payment methods, shown in-page while the line names them.
		const method = form.locator('#payment-method');
		if (await method.isVisible().catch(() => false)) {
			await expandSelect(method, 4);
			await page.waitForTimeout(400);
			await pointAlongOptions(page, method, 4, 5200);
			await method.selectOption('offline');
			await page.waitForTimeout(700);
			await collapseSelect(method);
		}
		await page.waitForTimeout(500);
		// Fixed or pay-what-you-can.
		const priceType = form.locator('#price-type');
		if (await priceType.isVisible().catch(() => false)) {
			await expandSelect(priceType, 2);
			await page.waitForTimeout(300);
			await pointAlongOptions(page, priceType, 2, 2400);
			await priceType.selectOption('fixed');
			await page.waitForTimeout(500);
			await collapseSelect(priceType);
		}
		await page.waitForTimeout(Math.max(500, narration.durationFor('tier')));
	});

	// ---- Scene: price, instructions, quantity, save. Same page, same form.
	narration.mark('instructions');
	await withOverlay(page, 'instructions', async () => {
		const form = page.getByRole('dialog');
		const price = form.locator('#price');
		if (await price.isVisible().catch(() => false)) {
			await glideIntoDialog(page, price, 400);
			await price.click();
			await price.fill('');
			await price.pressSequentially('12', { delay: 110 });
		}
		await page.waitForTimeout(250);
		const instructions = form.getByRole('textbox', { name: /Payment Instructions/ });
		if (await instructions.isVisible().catch(() => false)) {
			await glideIntoDialog(page, instructions, 450);
			await instructions.click();
			await instructions.pressSequentially(INSTRUCTIONS, { delay: 10 });
		}
		await page.waitForTimeout(300);
		const qty = form.locator('#total-quantity');
		if (await qty.isVisible().catch(() => false)) {
			await glideIntoDialog(page, qty, 500);
			await qty.click();
			await qty.fill('');
			await qty.pressSequentially('20', { delay: 110 });
		}
		await page.waitForTimeout(300);
		const create = form.getByRole('button', { name: 'Create Tier' });
		if (await create.isVisible().catch(() => false)) {
			await glideIntoDialog(page, create, 500);
			await create.hover();
			await page.waitForTimeout(400);
			if (await create.isEnabled().catch(() => false)) await create.click();
		}
		await form.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
		const early = visible(page, 'heading', 'Early bird');
		await early.waitFor({ timeout: 15_000 }).catch(() => undefined);
		if (await early.isVisible().catch(() => false)) {
			await early.scrollIntoViewIfNeeded().catch(() => undefined);
			await early.hover().catch(() => undefined);
		}
		await page.waitForTimeout(Math.max(1800, narration.durationFor('instructions')));
	});

	// ---- Cut: the buyer on the public event page.
	await episodeCut(page, 'The other side', 'Buying a ticket', event.path, {
		during: () => switchUser(page, buyer.email, buyer.password)
	});
	await settleAuth(page, 4000);
	await page.getByRole('region', { name: 'Ticket Options' }).waitFor({ timeout: 10_000 }).catch(() => undefined);
	// Ticket Options sits about a screen down — glide it up under the header
	// (silent, sped up) before the line starts.
	const optionsHeading = visible(page, 'heading', 'Ticket Options');
	const optBox = await optionsHeading.boundingBox().catch(() => null);
	await glideScroll(page, optBox ? Math.max(0, optBox.y - 140) : 900, 1600);
	await page.mouse.move(1500, 700);
	await page.waitForTimeout(300);
	narration.mark('buy');
	await withOverlay(page, 'buy', async () => {
		const earlyCard = visible(page, 'heading', 'Early bird');
		if (await earlyCard.isVisible().catch(() => false)) await earlyCard.hover().catch(() => undefined);
		await page.waitForTimeout(700);
		const addOne = visible(page, 'button', 'Add one Early bird');
		if (await addOne.isVisible().catch(() => false)) {
			await addOne.hover();
			await page.waitForTimeout(350);
			await addOne.click();
		}
		const cartBar = page.getByRole('region', { name: 'Cart summary' });
		await cartBar.waitFor({ timeout: 10_000 }).catch(() => undefined);
		await page.waitForTimeout(700);
		const buy = cartBar.getByRole('button', { name: 'Buy' });
		if (await buy.isVisible().catch(() => false)) {
			await buy.hover();
			await page.waitForTimeout(350);
			await buy.click();
		}
		// A single fixed-price tier checks out directly and the ticket modal opens
		// by itself; tolerate a checkout sheet anyway. Poll for whichever comes.
		const modal = page.getByRole('dialog');
		const instr = modal.getByText('Payment Instructions:').first();
		const reserve = modal.getByRole('button', { name: 'Reserve' });
		for (let i = 0; i < 100; i++) {
			if (await instr.isVisible().catch(() => false)) break;
			if (await reserve.isVisible().catch(() => false)) {
				await reserve.hover();
				await page.waitForTimeout(300);
				await reserve.click();
				await instr.waitFor({ timeout: 20_000 }).catch(() => undefined);
				break;
			}
			await page.waitForTimeout(200);
		}
		await page.waitForTimeout(900);
		const pendingBadge = modal.getByText('Pending', { exact: true }).first();
		if (await pendingBadge.isVisible().catch(() => false)) await pendingBadge.hover().catch(() => undefined);
		await page.waitForTimeout(1500);
		if (await instr.isVisible().catch(() => false)) await instr.hover().catch(() => undefined);
		await page.waitForTimeout(Math.max(2500, narration.durationFor('buy')));
	});

	// ---- Cut: the organizer on the event's ticket list.
	await episodeCut(page, 'Back at the club', 'Confirming the payment', ticketsPath, {
		during: () => switchUser(page, org.owner.email, org.owner.password)
	});
	await settleAuth(page, 4000);
	await visible(page, 'heading', 'Manage Tickets').waitFor({ timeout: 10_000 }).catch(() => undefined);
	const row = page.locator('table tbody tr').filter({ hasText: 'Jonas Feldmann' }).first();
	await row.waitFor({ timeout: 15_000 }).catch(() => undefined);
	// The counters are at the top and the row just below the fold — glide so
	// both are in frame (silent, sped up).
	const total = page.getByText('Total (page)').first();
	const totalBox = await total.boundingBox().catch(() => null);
	if (totalBox) await glideScroll(page, Math.max(0, totalBox.y - 260), 1500);
	await page.mouse.move(1500, 500);
	await page.waitForTimeout(300);
	narration.mark('confirm');
	await withOverlay(page, 'confirm', async () => {
		const pending = row.getByText('Pending', { exact: true }).first();
		if (await pending.isVisible().catch(() => false)) await pending.hover().catch(() => undefined);
		await page.waitForTimeout(1200);
		const confirmBtn = row.getByRole('button', { name: 'Confirm Payment' });
		if (await confirmBtn.isVisible().catch(() => false)) {
			await confirmBtn.hover();
			await page.waitForTimeout(500);
			await confirmBtn.click();
			const dialog = page.getByRole('dialog');
			const go = dialog.getByRole('button', { name: 'Confirm Payment' });
			await go.waitFor({ timeout: 10_000 }).catch(() => undefined);
			await page.waitForTimeout(1100);
			if (await go.isVisible().catch(() => false)) {
				await go.hover();
				await page.waitForTimeout(400);
				await go.click();
			}
			await dialog.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
		}
		await row.getByText('Active', { exact: true }).waitFor({ timeout: 15_000 }).catch(() => undefined);
		await page.waitForTimeout(500);
		// The revenue card appears above the counters and pushes the row down —
		// re-frame so the counters and the Active row share the screen.
		const totalAfter = await page.getByText('Total (page)').first().boundingBox().catch(() => null);
		if (totalAfter && Math.abs(totalAfter.y - 260) > 60) await glideScroll(page, totalAfter.y - 260, 1200);
		const active = row.getByText('Active', { exact: true }).first();
		if (await active.isVisible().catch(() => false)) await active.hover().catch(() => undefined);
		await page.waitForTimeout(1200);
		const activeStat = page.getByText('Active', { exact: true }).filter({ visible: true }).last();
		if (await activeStat.isVisible().catch(() => false)) await activeStat.hover().catch(() => undefined);
		await page.waitForTimeout(Math.max(2000, narration.durationFor('confirm')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
