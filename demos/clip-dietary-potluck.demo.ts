import { test, withOverlay } from '@argo-video/cli';
import { gotoClean, waitClientAuth, uiLogin, glideScroll } from './clip-helpers';

test.use({ bypassCSP: true });

const GUEST = 'jonas.guest@demovideo.example.com';
const PASSWORD = 'password123';
const EVENT = '/events/sunday-slow-picnic-club/picnic-in-the-park';
// A host suggestion nobody has taken. Jonas is seeded as attending with NO
// claim, which is exactly what this clip needs.
const ITEM = 'Seasonal salad';
const ALLERGEN = 'Peanuts';

test('clip-dietary-potluck', async ({ page, narration }) => {
	test.setTimeout(300_000);

	// Removing a saved preference or restriction fires a native confirm(), and
	// Playwright DISMISSES those by default — so the cleanup below silently did
	// nothing, stale rows piled up across takes, and re-adding an entry that
	// already existed was a no-op (the allergy kept showing the earlier take's
	// "Dislike" severity on camera). Accept them.
	page.on('dialog', (d) => d.accept());

	await uiLogin(page, GUEST, PASSWORD);
	await waitClientAuth(page);

	// ---- Self-healing (not recorded). Both scenes write real data now — the
	// preference and the allergy are saved so that the event's aggregated
	// dietary panel has something in it — so a previous take has to be undone,
	// or the dialogs open onto rows that already exist.
	await gotoClean(page, '/account/profile');
	// Saved preference and restriction rows each carry a delete button labelled
	// "Remove <name>" — nothing else on the page uses that pattern.
	const staleDelete = page.getByRole('button', { name: /^Remove / }).filter({ visible: true });
	for (let i = 0; i < 8 && (await staleDelete.count()) > 0; i++) {
		await staleDelete.first().click();
		await page.waitForTimeout(900);
	}
	await gotoClean(page, EVENT);
	const staleUnclaim = page
		.getByRole('button', { name: new RegExp(`Unclaim ${ITEM}`, 'i') })
		.filter({ visible: true });
	if (await staleUnclaim.count()) {
		await staleUnclaim.first().click();
		await page.waitForTimeout(1200);
	}

	await gotoClean(page, '/account/profile');
	await page.mouse.move(960, 400);

	await narration.startRecording(page);

	// ---- One continuous scene: profile → event page → potluck.
	//
	// Deliberately NOT split into three scenes. Every scene boundary is a 2s
	// fade through black, and all three beats here live either on one page or
	// across a slow navigation — so each boundary showed the same view either
	// side of the dip, or the old page fading back in before the new one
	// arrived. Cutting inside a single scene has no fade at all.
	narration.mark('dietary');
	await withOverlay(page, 'dietary', async () => {
		await page.waitForTimeout(800);

		// Preference: Vegetarian.
		const addPref = page
			.getByRole('button', { name: /Add Preference/i })
			.filter({ visible: true })
			.first();
		await addPref.scrollIntoViewIfNeeded();
		await page.waitForTimeout(500);
		await addPref.hover();
		await addPref.click();
		const prefDialog = page
			.locator('[role=dialog]')
			.filter({ hasText: 'Add Dietary Preference' })
			.first();
		await prefDialog.waitFor({ state: 'visible', timeout: 10_000 });
		await page.waitForTimeout(700);
		const select = prefDialog.locator('select').first();
		const options = await select.locator('option').evaluateAll((os) =>
			os
				.map((o) => ({ value: (o as HTMLOptionElement).value, label: (o.textContent ?? '').trim() }))
				.filter((o) => o.value)
		);
		const pick = options.find((o) => /vegetarian/i.test(o.label)) ?? options[0];
		if (pick) await select.selectOption(pick.value);
		await page.waitForTimeout(900);
		await prefDialog.getByRole('button', { name: /^Add Preference$/ }).click();
		await page.waitForTimeout(1600);

		// Allergy: the severity scale is what makes this more than a food fad.
		const addRestriction = page
			.getByRole('button', { name: /Add Restriction/i })
			.filter({ visible: true })
			.first();
		await addRestriction.scrollIntoViewIfNeeded();
		await page.waitForTimeout(400);
		await addRestriction.hover();
		await addRestriction.click();
		const restrictionDialog = page
			.locator('[role=dialog]')
			.filter({ hasText: 'Add Restriction' })
			.first();
		await restrictionDialog.waitFor({ state: 'visible', timeout: 10_000 });
		await page.waitForTimeout(600);
		await restrictionDialog.locator('input[type=text]').first().fill(ALLERGEN);
		await page.waitForTimeout(500);
		// Severity is a <select>, not a row of buttons, and it is selected by
		// VALUE — a by-label selection silently did nothing and the allergy
		// saved as "Dislike", which contradicted the narration on camera.
		const severity = restrictionDialog.locator('select').first();
		await severity.selectOption('allergy');
		if ((await severity.inputValue()) !== 'allergy') {
			throw new Error('dietary: severity did not switch to Allergy');
		}
		await page.waitForTimeout(900);
		await restrictionDialog
			.getByRole('button', { name: /^Add Restriction$/ })
			.filter({ visible: true })
			.last()
			.click();
		await page.waitForTimeout(1600);

		// --- Same scene, second location: what the host actually sees.
		// A plain navigation inside the scene is a straight cut, with no fade.
		await gotoClean(page, EVENT);
		const dietaryPanel = page
			.getByRole('button', { name: /Dietary Information/i })
			.filter({ visible: true })
			.first();
		await dietaryPanel.waitFor({ timeout: 20_000 }).catch(() => undefined);
		if (await dietaryPanel.count()) {
			await dietaryPanel.scrollIntoViewIfNeeded();
			await page.waitForTimeout(600);
			// Collapsed by default here — only open it if it is actually shut,
			// otherwise this closes the panel on camera.
			if ((await dietaryPanel.getAttribute('aria-expanded')) !== 'true') {
				await dietaryPanel.hover();
				await dietaryPanel.click();
				await page.waitForTimeout(1800);
			}
		}

		// --- Same scene, third beat: the potluck board further down the page.
		const header = page.getByRole('button', { name: /Potluck/ }).filter({ visible: true }).first();
		if (await header.count()) {
			await header.scrollIntoViewIfNeeded();
			// Already expanded for anyone attending — only toggle if closed.
			if ((await header.getAttribute('aria-expanded')) === 'false') {
				await header.click();
				await page.waitForTimeout(900);
			}
		}
		await page.waitForTimeout(800);
		const claim = page
			.getByRole('button', { name: `Claim ${ITEM}` })
			.filter({ visible: true })
			.first();
		if (await claim.count()) {
			await claim.scrollIntoViewIfNeeded();
			await claim.hover();
			await page.waitForTimeout(500);
			await claim.click();
			await page
				.getByText("You're bringing", { exact: false })
				.filter({ visible: true })
				.first()
				.waitFor({ timeout: 10_000 })
				.catch(() => undefined);
			await page.waitForTimeout(1500);
		}
		await glideScroll(page, 180, 1100);
		await page.waitForTimeout(Math.max(0, narration.durationFor('dietary')));
	});
});
