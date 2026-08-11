import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const sample = (name: string): string => resolve('public/samples', name);

const staticRoutes = ['/', '/about', '/privacy', '/sponsor', '/ics-viewer', '/vcf-viewer'];

for (const route of staticRoutes) {
  test(`${route} has no serious automated accessibility violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
    ).toEqual([]);
  });
}

test('calendar and contact result states remain accessible', async ({ page }) => {
  await page.goto('/ics-viewer');
  await page.locator('input[type=file]').setInputFiles(sample('calendar-basic.ics'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByRole('heading', { name: 'Calendar events' })).toBeVisible();
  let results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
  ).toEqual([]);

  await page.goto('/vcf-viewer');
  await page.locator('input[type=file]').setInputFiles(sample('contacts-basic.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
  results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
  ).toEqual([]);
});

test('uploader keyboard focus survives selection removal', async ({ page }) => {
  await page.goto('/ics-viewer');
  await page
    .locator('input[type=file]')
    .setInputFiles([sample('calendar-basic.ics'), sample('calendar-recurring.ics')]);
  await page.getByRole('button', { name: 'Remove calendar-basic.ics' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove calendar-recurring.ics' })).toBeFocused();
});
