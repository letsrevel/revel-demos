import { test, showOverlay } from '@argo-video/cli';

test.use({ bypassCSP: true });

// Standalone end card: real gradient R mark (logo-outro block) on the soft
// lavender surface. Stitch this at the end of every compilation.
test('clip-outro', async ({ page, narration }) => {
	test.setTimeout(120_000);

	await page.goto('about:blank');
	await page.evaluate(() => {
		document.body.style.margin = '0';
		document.body.innerHTML = `
			<div style="position:fixed;inset:0;background:linear-gradient(165deg,hsl(268 60% 96%) 0%,hsl(268 55% 94%) 55%,hsl(226 100% 93%) 100%);"></div>`;
	});

	await narration.startRecording(page);
	narration.mark('outro');
	await showOverlay(page, 'outro', narration.durationFor('outro'));
	await page.waitForTimeout(500);
});
