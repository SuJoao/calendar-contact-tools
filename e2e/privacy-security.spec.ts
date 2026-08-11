import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const sample = (name: string): string => resolve('public/samples', name);

test('representative processing stays local and satisfies the active CSP', async ({ page }) => {
  const externalRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173')
      externalRequests.push(request.url());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/ics-viewer');
  await page.evaluate(() => {
    const violations: string[] = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      violations.push(`${event.violatedDirective}: ${event.blockedURI}`),
    );
    Object.assign(window, { __cspViolations: violations });
  });
  await page.locator('input[type=file]').setInputFiles(sample('calendar-basic.ics'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByRole('heading', { name: 'Calendar events' })).toBeVisible();

  await page.goto('/vcf-viewer');
  await page.locator('input[type=file]').setInputFiles(sample('contacts-basic.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();

  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(await page.context().cookies()).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test('hostile sponsor and uploaded URLs never become active requests', async ({ page }) => {
  const remote: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1')) remote.push(request.url());
  });
  await page.goto('/vcf-viewer');
  const hostile = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    'FN:<img src=https://tracking.invalid/pixel>',
    'URL:javascript:alert(1)',
    'PHOTO:https://tracking.invalid/photo.png',
    'END:VCARD',
  ].join('\r\n');
  await page.locator('input[type=file]').setInputFiles({
    name: '<script>.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from(hostile),
  });
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByText('<img src=https://tracking.invalid/pixel>')).toBeVisible();
  expect(remote).toEqual([]);
  await expect(page.locator('#result img, #result script')).toHaveCount(0);
});

test('navigating away terminates active local workers without stale UI', async ({ page }) => {
  await page.goto('/ics-viewer');
  const events = Array.from(
    { length: 4_000 },
    (_, index) =>
      `BEGIN:VEVENT\r\nUID:cleanup-${index}@test.invalid\r\nDTSTART:20260809T120000Z\r\nSUMMARY:Cleanup ${index}\r\nDESCRIPTION:${'x'.repeat(80)}\r\nEND:VEVENT`,
  );
  await page.locator('input[type=file]').setInputFiles({
    name: 'cleanup.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join('\r\n')}\r\nEND:VCALENDAR`,
    ),
  });
  const workerStarted = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Process files' }).click();
  await workerStarted;
  await page.getByRole('link', { name: 'About' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Small tools, transparent behavior' }),
  ).toBeVisible();
  await expect.poll(() => page.workers().length).toBe(0);
  await expect(page.locator('#result')).toHaveCount(0);
});
