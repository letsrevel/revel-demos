import { defineConfig } from '@playwright/test';
import config from './argo.config.mjs';

const scale = Math.max(1, Math.round(config.video?.deviceScaleFactor ?? 1));
const width = config.video?.width ?? 1920;
const height = config.video?.height ?? 1080;

// Recording is driven by narration.startRecording(page) in the demo
// (page.screencast.start under the hood) — no Playwright recordVideo here.
export default defineConfig({
  preserveOutput: 'always',
  projects: [
    {
      name: 'demos',
      testDir: 'demos',
      testMatch: '**/*.demo.ts',
      use: {
        // Locator actions must FAIL, not wait until the test timeout — a
        // never-matching hover/scroll otherwise hangs a recording for minutes
        // and .catch() never fires (endless waiting is not rejection).
        actionTimeout: 15_000,
        browserName: config.video?.browser ?? 'chromium',
        baseURL: process.env.BASE_URL || config.baseURL || 'http://localhost:3000',
        viewport: { width, height },
        deviceScaleFactor: scale,
        video: 'off',
      },
    },
  ],
});
