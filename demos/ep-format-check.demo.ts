import { test, withOverlay } from '@argo-video/cli';
import { glideScroll, uiLogin, waitClientAuth } from './clip-helpers';
import { showTitleCard, titleCardCutTo, episodeCut, closeEpisode } from './episode-helpers';

test.use({ bypassCSP: true });

// The series' skeleton, with nothing in it: title card → app page → persona
// cut → second page → end card. Render this after touching episode-helpers.ts
// to check the framing still holds. It is also the file to copy when starting
// an episode.
const CARD = { episode: 0, title: 'The shape of an episode', pov: 'nobody in particular' };

test('ep-format-check', async ({ page, narration }) => {
	test.setTimeout(300_000);

	// ---- Setup (not recorded): log in so the first app page carries auth.
	await uiLogin(page, 'alice.owner@example.com', 'password123');
	await waitClientAuth(page);

	await showTitleCard(page, CARD);
	await narration.startRecording(page);

	// ---- Open.
	narration.mark('title');
	await page.waitForTimeout(Math.max(0, narration.durationFor('title')));

	// ---- Scene 1.
	await titleCardCutTo(page, CARD, '/events');
	narration.mark('browse');
	await withOverlay(page, 'browse', async () => {
		await page.waitForTimeout(800);
		await glideScroll(page, 500, 2500);
		await page.waitForTimeout(Math.max(0, narration.durationFor('browse')));
	});

	// ---- Scene 2, after a cut.
	await episodeCut(page, 'Meanwhile', 'Somewhere else entirely', '/organizations');
	narration.mark('orgs');
	await withOverlay(page, 'orgs', async () => {
		await page.waitForTimeout(800);
		await glideScroll(page, 400, 2500);
		await page.waitForTimeout(Math.max(0, narration.durationFor('orgs')));
	});

	// ---- Close.
	narration.mark('close');
	await closeEpisode(page, narration.durationFor('close'));
});
