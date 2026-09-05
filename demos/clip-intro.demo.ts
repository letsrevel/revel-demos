import { test } from '@argo-video/cli';
import { readFileSync } from 'node:fs';

test.use({ bypassCSP: true });

// Intro card: soft lavender surface, the gradient R mark, and the canonical
// tagline (verbatim FE hero copy) — both painted directly, no argo overlay.
test('clip-intro', async ({ page, narration }) => {
	test.setTimeout(120_000);

	const b64 = readFileSync(new URL('../assets/revel-R-gradient-padded.png.b64', import.meta.url), 'utf8').replace(/\s/g, '');
	await page.goto('about:blank');
	await page.evaluate((logo) => {
		document.body.style.margin = '0';
		document.body.innerHTML = `
			<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.4rem;background:linear-gradient(165deg,hsl(268 60% 96%) 0%,hsl(268 55% 94%) 55%,hsl(226 100% 93%) 100%);font-family:-apple-system,'Nata Sans',sans-serif;">
				<img src="data:image/png;base64,${logo}" style="width:160px;height:160px;" alt="" />
				<div style="color:#0D1E1C;font-size:1.9rem;font-weight:700;line-height:1.3;text-align:center;max-width:46rem;">The free, open-source event platform for communities, clubs and independent venues.</div>
			</div>`;
	}, b64);

	await narration.startRecording(page);
	narration.mark('intro');
	await page.waitForTimeout(narration.durationFor('intro') + 800);
});
