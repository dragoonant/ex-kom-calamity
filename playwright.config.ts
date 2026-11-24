import { defineConfig } from '@playwright/test';

// Each worktree gets its own port (KB gotchas: port reuse serves a stale sibling build). Headless
// SwiftShader draws at a few frames a second, so time moves through window.__ib hook, one worker.
const port = Number(process.env.PW_PORT ?? 5231);

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/out/results',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}/`,
    viewport: { width: 1440, height: 900 },
    browserName: 'chromium',
    // A machine whose pre-installed Chromium is not the one this Playwright pins sets PW_CHROMIUM to its binary.
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
