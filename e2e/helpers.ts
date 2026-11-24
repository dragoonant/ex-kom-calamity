import type { Page } from '@playwright/test';
export async function toBattle(page: Page): Promise<void> {
  await page.goto('./');
  await page.click('[data-testid=new]');
  await page.click('[data-testid=skip-brief]');
  await page.click('[data-testid=deploy]');
  await page.waitForSelector('[data-testid=battle]');
  await page.waitForFunction(() => !!(window as any).__ib?.screenPointOfTile(6, 16));
}
export const ib = (page: Page, js: string) => page.evaluate(js);
