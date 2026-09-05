import { test, withOverlay, demoType } from '@argo-video/cli';
// @ts-expect-error plain JS shared with probes
import { createDressedOrg, createEvent, createPotluckItem, registerVerifiedUser, rsvpYes } from './arrange-lib.mjs';
import { gotoClean, waitClientAuth, uiLogin, slowScroll } from './clip-helpers';

test.use({ bypassCSP: true });

// Potluck coordination, arranged 100% from scratch: fresh org, fresh event,
// fresh items, fresh guests.
test('clip-user-potluck', async ({ page, narration }) => {
	test.setTimeout(540_000);

	// ---- Arrange (not recorded)
	const org = await createDressedOrg({
		name: 'Sunday Slow Picnic Club',
		description:
			'We meet in the park, we eat too much, we stay until the light goes golden. Everyone brings something; nobody brings stress.'
	});
	const event = await createEvent(org.slug, org.owner.token, {
		name: 'Picnic in the Park',
		requires_ticket: false,
		potluck_open: true,
		max_attendees: 40,
		address: 'Augarten, Vienna, Austria',
		description:
			'Blankets, food, friends, frisbees. We claim spots by the big trees — look for the balloons. Bring a dish if you can!'
	});
	// Host suggestions (unclaimed, up for grabs)
	for (const item of [
		{ name: 'Something on the grill', item_type: 'main_course', quantity: 'serves 10' },
		{ name: 'A big green salad', item_type: 'side_dish', quantity: 'serves 8' },
		{ name: 'Cups, plates & napkins', item_type: 'supplies' },
		{ name: 'Speaker + picnic playlist', item_type: 'entertainment' }
	]) {
		await createPotluckItem(event.id, org.owner.token, item);
	}
	// A fellow guest who already claimed a couple of things
	const fellow = await registerVerifiedUser('fellow', 'Kim', 'Guest');
	await rsvpYes(event.id, fellow.token);
	await createPotluckItem(event.id, fellow.token, {
		name: 'Elote corn salad',
		item_type: 'side_dish',
		quantity: 'big bowl',
		claim: true
	});
	await createPotluckItem(event.id, fellow.token, {
		name: 'Watermelon',
		item_type: 'food',
		quantity: '2 whole',
		claim: true
	});
	// Our on-camera guest, attending
	const guest = await registerVerifiedUser('picnicker', 'Noa', 'Sunshine');
	await rsvpYes(event.id, guest.token);

	// ---- On camera
	await uiLogin(page, guest.email, guest.password);
	await gotoClean(page, event.path);
	await waitClientAuth(page);
	await page.mouse.move(960, 400);

	await narration.startRecording(page);

	// Scene 1: open the potluck board
	narration.mark('board');
	await withOverlay(page, 'board', async () => {
		await page.waitForTimeout(1000);
		const header = page
			.getByRole('button', { name: /Potluck Coordination/ })
			.filter({ visible: true })
			.first();
		await header.scrollIntoViewIfNeeded();
		await header.hover();
		await page.waitForTimeout(600);
		// The section starts EXPANDED for attendees (isExpanded = hasRSVPd) —
		// only click when it is actually collapsed, or we'd close it.
		if ((await header.getAttribute('aria-expanded')) === 'false') {
			await header.click();
		}
		await page
			.getByRole('button', { name: 'Claim A big green salad' })
			.waitFor({ state: 'visible', timeout: 10_000 });
		await slowScroll(page, 300, 1500);
		await page.waitForTimeout(Math.max(1000, narration.durationFor('board')));
	});

	// Scene 2: claim an item
	narration.mark('claim');
	await withOverlay(page, 'claim', async () => {
		const claim = page
			.getByRole('button', { name: 'Claim A big green salad' })
			.filter({ visible: true })
			.first();
		await claim.scrollIntoViewIfNeeded();
		await claim.hover();
		await page.waitForTimeout(700);
		await claim.click();
		await page
			.getByText("You're bringing", { exact: false })
			.first()
			.waitFor({ timeout: 10_000 })
			.catch(() => undefined);
		await page.waitForTimeout(Math.max(1500, narration.durationFor('claim')));
	});

	// Scene 3: add your own item
	narration.mark('add');
	await withOverlay(page, 'add', async () => {
		const add = page
			.getByRole('button', { name: "Add item you'll bring" })
			.filter({ visible: true })
			.first();
		await add.scrollIntoViewIfNeeded();
		await add.hover();
		await page.waitForTimeout(500);
		await add.click();
		const nameInput = page.locator('#edit-item-name');
		await nameInput.waitFor({ timeout: 10_000 });
		await nameInput.click();
		await demoType(page, nameInput, 'Lemon iced tea', 60);
		await page.locator('#edit-item-type').selectOption('non_alcoholic').catch(() => undefined);
		const qty = page.getByPlaceholder(/serves|bottles/i).first();
		if (await qty.isVisible().catch(() => false)) {
			await qty.click();
			await demoType(page, qty, '2 big jugs', 60);
		}
		await page.waitForTimeout(500);
		const submit = page.getByRole('button', { name: 'Add & claim' });
		await submit.hover();
		await page.waitForTimeout(400);
		await submit.click();
		await page.waitForTimeout(Math.max(2000, narration.durationFor('add')));
	});
	await page.waitForTimeout(600);
});
