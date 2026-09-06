import { defineConfig } from '@playwright/test';
export default defineConfig({
	testDir: '.',
	testMatch: '**/*.check.ts',
	use: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
});
