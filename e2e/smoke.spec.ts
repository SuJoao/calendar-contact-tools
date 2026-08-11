import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const sample = (name: string): string => resolve('public/samples', name);

test('loads direct routes, theme controls, and the 404 page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle light and dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /dark|light/);
  await page.goto('/privacy');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Files stay inside your browser' }),
  ).toBeVisible();
  await page.goto('/not-a-real-route');
  await expect(page.getByRole('heading', { name: 'That page is not here' })).toBeVisible();
});

test('processes ICS and completes a CSV download', async ({ page }) => {
  await page.goto('/ics-to-csv');
  await page.locator('input[type=file]').setInputFiles(sample('calendar-basic.ics'));
  await page.getByRole('button', { name: 'Process files' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});

test('processes VCF and completes a CSV download', async ({ page }) => {
  await page.goto('/vcf-to-csv');
  await page.locator('input[type=file]').setInputFiles(sample('contacts-basic.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});

test('loads recurrence and duplicate review result states', async ({ page }) => {
  await page.goto('/ics-recurring-events-viewer');
  await page.locator('input[type=file]').setInputFiles(sample('calendar-recurring.ics'));
  await page.getByRole('button', { name: 'Process file' }).click();
  await expect(page.getByRole('heading', { name: 'Recurring events summary' })).toBeVisible();

  await page.goto('/vcf-duplicate-remover');
  await page.locator('input[type=file]').setInputFiles(sample('contacts-duplicates.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByRole('heading', { name: 'Duplicate review', exact: true })).toBeVisible();
});
