import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sample = (name: string): string => resolve('public/samples', name);
const icsFixture = (name: string): string => resolve('src/tests/fixtures/ics', name);
const vcfFixture = (name: string): string => resolve('src/tests/fixtures/vcf', name);

test('opens an ICS sample in the viewer', async ({ page }) => {
  await page.goto('/ics-viewer');
  await page.locator('input[type=file]').setInputFiles(sample('calendar-basic.ics'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByRole('heading', { name: 'Calendar events' })).toBeVisible();
  await expect(page.getByText('Project planning, phase two')).toBeVisible();
});

test('serves unique route metadata and valid structured data', async ({ page }) => {
  const routes = [
    '/',
    '/ics-viewer',
    '/ics-to-csv',
    '/ics-merge',
    '/ics-timezone-fixer',
    '/ics-recurring-events-viewer',
    '/vcf-viewer',
    '/vcf-to-csv',
    '/vcf-merge',
    '/vcf-duplicate-remover',
    '/about',
    '/privacy',
    '/sponsor',
  ];
  const titles = new Set<string>();
  const validPaths = new Set(routes);
  for (const route of routes) {
    await page.goto(route);
    const title = await page.title();
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(title.length).toBeGreaterThan(19);
    expect(description?.length).toBeGreaterThan(109);
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toContain(route);
    const json = await page.locator('script[type="application/ld+json"]').textContent();
    expect(() => JSON.parse(json ?? '')).not.toThrow();
    const internalLinks = await page.locator('a[href]').evaluateAll((links) =>
      links
        .map((link) => new URL((link as HTMLAnchorElement).href))
        .filter((url) => url.origin === location.origin)
        .map((url) => url.pathname.replace(/\/$/, '') || '/'),
    );
    for (const linkedPath of internalLinks) expect(validPaths.has(linkedPath)).toBe(true);
    titles.add(title);
  }
  expect(titles.size).toBe(routes.length);
});

test('keeps sponsor claims honest and placeholders non-clickable', async ({ page }) => {
  await page.goto('/sponsor');
  await expect(page.getByRole('heading', { name: /Reach people/ })).toBeVisible();
  await expect(page.getByText(/reliable baseline/)).toBeVisible();
  await expect(page.getByText(/configure a real contact email/).first()).toBeVisible();
  await expect(page.locator('a[href*="hello@example.com"]')).toHaveCount(0);
  await expect(page.locator('.sponsor-card[target="_blank"]')).toHaveCount(0);
  await expect(page.getByText(/No tracking pixels, remote scripts/)).toBeVisible();
});

test('renders a useful noindex 404 without a canonical', async ({ page }) => {
  await page.goto('/not-a-real-route');
  await expect(page.getByRole('heading', { name: 'That page is not here' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Return home' })).toBeVisible();
});

test('searches and filters calendar events', async ({ page }) => {
  await page.goto('/ics-viewer');
  await page.locator('input[type=file]').setInputFiles(sample('calendar-basic.ics'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await page.getByLabel('Search').fill('Team day');
  await expect(page.getByRole('cell', { name: 'Team day', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Project planning, phase two' })).toHaveCount(0);
  await page.getByLabel('Search').fill('');
  await page.getByLabel('Timezone').selectOption('All-day');
  await expect(page.getByRole('cell', { name: 'Team day', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Project planning, phase two' })).toHaveCount(0);
});

test('recovers valid events from a partially malformed calendar', async ({ page }) => {
  await page.goto('/ics-viewer');
  await page.locator('input[type=file]').setInputFiles(icsFixture('malformed-event.ics'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByRole('cell', { name: 'Valid before malformed event' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Valid after malformed event' })).toBeVisible();
  await expect(page.getByText(/1 events could not be parsed/)).toBeVisible();
  await expect(page.locator('.notice.warning')).toContainText('DTSTART');
});

test('labels floating and all-day calendar values without timezone conversion', async ({
  page,
}) => {
  await page.goto('/ics-viewer');
  await page
    .locator('input[type=file]')
    .setInputFiles([icsFixture('floating-time.ics'), icsFixture('all-day.ics')]);
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByRole('cell', { name: 'Floating time' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Date only' }).last()).toBeVisible();
  await expect(page.getByRole('cell', { name: '2026-08-08T12:00:00' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2026-08-08', exact: true })).toBeVisible();
});

test('renders hostile event content as text without loading or executing it', async ({ page }) => {
  let externalRequests = 0;
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1')) externalRequests += 1;
  });
  await page.goto('/ics-viewer');
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).icsExecuted = false;
  });
  const hostile = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:hostile@example.test',
    'DTSTART:20260808T120000Z',
    'SUMMARY:<script>window.icsExecuted=true</script>',
    'DESCRIPTION:<img src=x onerror=window.icsExecuted=true>',
    'LOCATION:<svg onload=window.icsExecuted=true>',
    'URL:javascript:alert(1)',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  await page.locator('input[type=file]').setInputFiles({
    name: '<img src=x onerror=alert(1)>.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(hostile),
  });
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(
    page.getByRole('cell', { name: '<script>window.icsExecuted=true</script>' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as Record<string, unknown>).icsExecuted),
  ).toBe(false);
  expect(externalRequests).toBe(0);
  await expect(page.locator('#result img')).toHaveCount(0);
  await expect(page.locator('.selected-files img')).toHaveCount(0);
  await expect(page.locator('#result script')).toHaveCount(0);
  await expect(page.locator('#result svg')).toHaveCount(0);
});

test('moves a large generated calendar across the worker boundary', async ({ page }) => {
  await page.goto('/ics-viewer');
  const eventCount = 4_000;
  const events = Array.from(
    { length: eventCount },
    (_unused, index) =>
      `BEGIN:VEVENT\r\nUID:worker-${index}@example.test\r\nDTSTART:20260808T120000Z\r\nDTEND:20260808T130000Z\r\nSUMMARY:Generated worker event ${index}\r\nDESCRIPTION:${'x'.repeat(32)}\r\nEND:VEVENT`,
  );
  const calendar = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
  await page.locator('input[type=file]').setInputFiles({
    name: 'large-generated.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(calendar),
  });
  const workerStarted = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Process files' }).click();
  await workerStarted;
  await expect(page.getByText(`${eventCount} events loaded`)).toBeVisible();
});

test('converts an ICS sample to CSV', async ({ page }) => {
  await page.goto('/ics-to-csv');
  await page.locator('input[type=file]').setInputFiles(sample('calendar-basic.ics'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible();
});

test('merges two calendars and reports a duplicate', async ({ page }) => {
  await page.goto('/ics-merge');
  await page
    .locator('input[type=file]')
    .setInputFiles([sample('calendar-basic.ics'), sample('calendar-basic.ics')]);
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.locator('.summary-row').getByText(/duplicate candidates/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Duplicate review' })).toBeVisible();
  await expect(page.getByText(/Same non-empty UID/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Keep first' }).first().click();
  await expect(page.locator('.summary-row').getByText(/3 events included/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download merged ICS' })).toBeVisible();
});

test('keeps merge review content inert for malformed and hostile sources', async ({ page }) => {
  await page.goto('/ics-merge');
  const hostile = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'X-WR-CALNAME:<img src=x onerror=alert(1)>',
    'BEGIN:VEVENT',
    'UID:hostile@example.test',
    'DTSTART:20260808T120000Z',
    'SUMMARY:<script>window.mergeExecuted=true</script>',
    'LOCATION:<svg onload=alert(1)>',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  await page.locator('input[type=file]').setInputFiles([
    { name: '<img src=x>.ics', mimeType: 'text/calendar', buffer: Buffer.from(hostile) },
    {
      name: 'malformed-event.ics',
      mimeType: 'text/calendar',
      buffer: readFileSync(icsFixture('malformed-event.ics')),
    },
  ]);
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByRole('button', { name: 'Download merged ICS' })).toBeVisible();
  await expect(page.locator('#result img, #result script, #result svg')).toHaveCount(0);
});

test('analyzes a large merge in a worker and paginates duplicate review', async ({ page }) => {
  await page.goto('/ics-merge');
  const eventCount = 2_000;
  const events = Array.from(
    { length: eventCount },
    (_unused, index) =>
      `BEGIN:VEVENT\r\nUID:merge-worker-${index}@example.test\r\nDTSTART:20260808T120000Z\r\nDTEND:20260808T130000Z\r\nSUMMARY:Generated merge event ${index}\r\nDESCRIPTION:${'x'.repeat(64)}\r\nEND:VEVENT`,
  );
  const calendar = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
  await page.locator('input[type=file]').setInputFiles([
    { name: 'large-a.ics', mimeType: 'text/calendar', buffer: Buffer.from(calendar) },
    { name: 'large-b.ics', mimeType: 'text/calendar', buffer: Buffer.from(calendar) },
  ]);
  const workerStarted = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Process files' }).click();
  await workerStarted;
  await expect(
    page.locator('.summary-row').getByText(`${eventCount * 2} readable events`),
  ).toBeVisible();
  await expect(page.getByText(`Candidates 1–100 of ${eventCount}`)).toBeVisible();
  await page.getByRole('button', { name: 'Next candidates' }).click();
  await expect(page.getByText(`Candidates 101–200 of ${eventCount}`)).toBeVisible();
});

test('inspects, converts, assigns, and resets mixed timezone events', async ({ page }) => {
  await page.goto('/ics-timezone-fixer');
  await page.locator('input[type=file]').setInputFiles(icsFixture('timezone-mixed.ics'));
  await page.getByRole('button', { name: 'Process file' }).click();
  await expect(page.getByRole('heading', { name: 'Timezone inspection' })).toBeVisible();
  await expect(page.locator('.summary-row').getByText('1 floating')).toBeVisible();

  await page.getByLabel('Action').selectOption('convert');
  await page.getByLabel('Source timezone (convert)').fill('Europe/Lisbon');
  await page.getByLabel('Target timezone').fill('UTC');
  await page.getByRole('button', { name: 'Process file' }).click();
  await expect(page.getByRole('heading', { name: 'Timezone change preview' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /All-day dates are protected/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Floating time was not interpreted/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download corrected ICS' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset changes' }).click();
  await expect(page.getByText(/0 changed/)).toBeVisible();

  await page.getByLabel('Action').selectOption('assign');
  await page.getByLabel('Target timezone').fill('America/New_York');
  await page.getByRole('button', { name: 'Process file' }).click();
  await expect(page.getByRole('cell', { name: /wall-clock time preserved/i })).toBeVisible();
});

test('inspects a recurrence series, expands a range, and exports CSV', async ({ page }) => {
  await page.goto('/ics-recurring-events-viewer');
  await page.getByLabel('From').fill('2026-08-01');
  await page.getByLabel('Until').fill('2026-12-31');
  await page.locator('input[type=file]').setInputFiles(sample('calendar-recurring.ics'));
  await page.getByRole('button', { name: 'Process file' }).click();
  await expect(page.getByRole('heading', { name: 'Recurring events summary' })).toBeVisible();
  await expect(page.locator('.summary-row').getByText('2 recurring series')).toBeVisible();
  await expect(page.locator('#recurrence-series')).toContainText('Language club');
  await expect(page.getByRole('heading', { name: /Every week/i })).toBeVisible();
  await expect(page.locator('.recurrence-definition pre')).toContainText('FREQ=WEEKLY');
  await page.getByRole('button', { name: 'Expand selected series' }).click();
  await expect(page.getByRole('heading', { name: 'Occurrence results' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Language club – português' }).first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download occurrences CSV' }).click();
  expect((await download).suggestedFilename()).toBe('calendar-recurring-recurring-events.csv');
});

test('omits EXDATE identities and includes RDATE additions', async ({ page }) => {
  await page.goto('/ics-recurring-events-viewer');
  await page.getByLabel('From').fill('2026-08-01');
  await page.getByLabel('Until').fill('2026-08-15');
  await page.locator('input[type=file]').setInputFiles(icsFixture('recurrence/rdate-exdate.ics'));
  await page.getByRole('button', { name: 'Process file' }).click();
  await page.getByRole('button', { name: 'Expand selected series' }).click();
  await expect(page.getByRole('cell', { name: '2026-08-10T09:00:00.000Z' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'rdate', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2026-08-03T09:00:00.000Z' })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: '2026-08-04T09:00:00.000Z' })).toHaveCount(0);
});

test('replaces a recurrence instance with its modified override', async ({ page }) => {
  await page.goto('/ics-recurring-events-viewer');
  await page.getByLabel('From').fill('2026-08-01');
  await page.getByLabel('Until').fill('2026-08-31');
  await page.locator('input[type=file]').setInputFiles(icsFixture('recurrence/override.ics'));
  await page.getByRole('button', { name: 'Process file' }).click();
  await expect(
    page.locator('.summary-row').getByText('1 series with modified occurrences'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Expand selected series' }).click();
  await expect(page.getByRole('cell', { name: 'Moved fictional meeting' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2026-08-15T11:00:00' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Modified occurrence' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2026-08-15T09:00:00' })).toHaveCount(0);
});

test('keeps a zoned weekly recurrence at local wall time across DST', async ({ page }) => {
  await page.goto('/ics-recurring-events-viewer');
  await page.getByLabel('From').fill('2026-03-20');
  await page.getByLabel('Until').fill('2026-04-10');
  await page.locator('input[type=file]').setInputFiles(icsFixture('recurrence/zoned-dst.ics'));
  await page.getByRole('button', { name: 'Process file' }).click();
  await page.getByRole('button', { name: 'Expand selected series' }).click();
  await expect(page.getByRole('cell', { name: '2026-03-22T09:00:00' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2026-03-29T09:00:00' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2026-04-05T09:00:00' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Europe/Lisbon' }).first()).toBeVisible();
});

test('stops an explosive recurrence safely in the worker', async ({ page }) => {
  await page.goto('/ics-recurring-events-viewer');
  await page.getByLabel('From').fill('2026-08-01');
  await page.getByLabel('Until').fill('2027-08-01');
  await page
    .locator('input[type=file]')
    .setInputFiles(icsFixture('recurrence/recurrence-bomb.ics'));
  await page.getByRole('button', { name: 'Process file' }).click();
  const workerStarted = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Expand selected series' }).click();
  await workerStarted;
  await expect(page.getByText(/Expansion stopped at a safety limit/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand selected series' })).toBeEnabled();
});

test('cancels worker recurrence expansion and keeps hostile text inert', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1')) externalRequests.push(request.url());
  });
  await page.goto('/ics-recurring-events-viewer');
  await page.getByLabel('From').fill('2026-01-01');
  await page.getByLabel('Until').fill('2027-12-31');
  await page.getByLabel('Maximum per series').fill('10000');
  const hostile = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:hostile-recurrence@example.test',
    'DTSTART:20260101T000000Z',
    'RRULE:FREQ=HOURLY',
    'SUMMARY:<script>window.recurrenceExecuted=true</script>',
    'LOCATION:<img src=https://attacker.invalid/pixel onerror=alert(1)>',
    'DESCRIPTION:<svg onload=alert(1)>',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  await page.locator('input[type=file]').setInputFiles({
    name: '<img src=x>.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(hostile),
  });
  await page.getByRole('button', { name: 'Process file' }).click();
  await expect(page.locator('#recurrence-series')).toContainText('<script>');
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('#expand-recurrence')!.click();
    document.querySelector<HTMLButtonElement>('#cancel-recurrence-expansion')!.click();
  });
  await expect(page.getByText(/Expansion cancelled/)).toBeVisible();
  await expect(page.locator('#result img, #result script, #result svg')).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test('opens a VCF sample without loading remote images', async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1')) remoteRequests.push(request.url());
  });
  await page.goto('/vcf-viewer');
  await page.locator('input[type=file]').setInputFiles(sample('contacts-basic.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByText(/Sofía Núñez/).first()).toBeVisible();
  expect(remoteRequests).toEqual([]);
});

test('searches, filters, and expands structured VCF contacts', async ({ page }) => {
  await page.goto('/vcf-viewer');
  await page.locator('input[type=file]').setInputFiles(sample('contacts-basic.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.locator('.summary-row')).toContainText('2 contacts');
  await page.getByLabel('Search').fill('sofia@example.test');
  await expect(page.getByText('Sofía Núñez', { exact: true })).toBeVisible();
  await expect(page.getByText('Ren Tanaka', { exact: true })).toHaveCount(0);
  await page.getByLabel('Search').fill('');
  await page.getByLabel('Has field').selectOption('email');
  await page.getByText('Sofía Núñez', { exact: true }).click();
  await expect(page.getByText('s.nunez@example.test')).toBeVisible();
  await expect(page.getByText('+351 210 000 202')).toBeVisible();
  await expect(page.getByText('12 Sample Street, Lisboa, 1000-001, Portugal')).toBeVisible();
});

test('recovers readable VCF contacts and reports the malformed card', async ({ page }) => {
  await page.goto('/vcf-viewer');
  await page.locator('input[type=file]').setInputFiles(vcfFixture('malformed-contact.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByText('Readable Before', { exact: true })).toBeVisible();
  await expect(page.getByText('Readable After', { exact: true })).toBeVisible();
  await expect(page.locator('.summary-row')).toContainText('1 malformed contacts skipped');
  await expect(page.locator('.notice.warning')).toContainText('no readable identity');
});

test('never loads remote VCF media and keeps hostile values inert', async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1')) remoteRequests.push(request.url());
  });
  await page.goto('/vcf-viewer');
  const hostile = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    'FN:<script>window.vcfExecuted=true</script>',
    'N:<img src=x onerror=alert(1)>;Hostile;;;',
    'ORG:<svg onload=alert(1)>',
    'TITLE:=HYPERLINK("https://evil.example")',
    'NOTE:<img src=https://attacker.invalid/pixel onerror=alert(1)>',
    'ADR:;;<script>alert(1)</script>;Test;;;;',
    'URL:javascript:alert(1)',
    'PHOTO:data:text/html,<svg onload=alert(1)>',
    'X-CUSTOM:<script>alert(1)</script>',
    'END:VCARD',
  ].join('\r\n');
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'remote-photo.vcf',
      mimeType: 'text/vcard',
      buffer: readFileSync(vcfFixture('remote-photo.vcf')),
    },
    {
      name: 'vendor-properties.vcf',
      mimeType: 'text/vcard',
      buffer: readFileSync(vcfFixture('vendor-properties.vcf')),
    },
    {
      name: '<img src=x onerror=alert(1)>.vcf',
      mimeType: 'text/vcard',
      buffer: Buffer.from(hostile),
    },
  ]);
  await page.getByRole('button', { name: 'Process files' }).click();
  await page.getByText('Remote Photo', { exact: true }).click();
  await expect(page.getByText(/Remote image not loaded/)).toBeVisible();
  await page.getByText('Vendor Example', { exact: true }).click();
  const vendorRow = page.getByRole('row', { name: /Vendor Example/ });
  await vendorRow.getByText('Additional properties').click();
  await expect(vendorRow.getByText('<script>alert(1)</script>')).toBeVisible();
  await page.getByText('<script>window.vcfExecuted=true</script>', { exact: true }).click();
  const hostileRow = page.getByRole('row', { name: /window\.vcfExecuted/ });
  await expect(
    hostileRow.getByText('<img src=https://attacker.invalid/pixel onerror=alert(1)>'),
  ).toBeVisible();
  await expect(page.locator('#result img, #result script, #result svg')).toHaveCount(0);
  expect(remoteRequests).toEqual([]);
});

test('previews selected VCF CSV columns and exports repeated fields', async ({ page }) => {
  await page.goto('/vcf-to-csv');
  await page.locator('input[name=column]').first().check();
  await page.getByLabel('Repeated fields').selectOption('expanded');
  await page.locator('input[type=file]').setInputFiles(vcfFixture('repeated-values.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByRole('heading', { name: 'CSV preview' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Repeated field' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'home@example.test' }).first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toBe('repeated-values.csv');
});

test('protects formula payloads in downloaded contact CSV without changing phone numbers', async ({
  page,
}) => {
  await page.goto('/vcf-to-csv');
  await page.locator('input[type=file]').setInputFiles(vcfFixture('csv-injection.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.locator('#result script, #result img, #result svg')).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const csv = readFileSync(path!, 'utf8');
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).toContain("'@SUM(1+1)");
  expect(csv).toContain('+351 912 345 678');
});

test('moves a large VCF across the worker boundary and bounds rendered rows', async ({ page }) => {
  await page.goto('/vcf-viewer');
  const contactCount = 4_000;
  const contact = (index: number): string =>
    `BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Generated Contact ${index}\r\nN:Contact ${index};Generated;;;\r\nORG:Fictional Organization ${index % 20}\r\nEMAIL:person${index}@example.test\r\nTEL:+351 910 ${String(index).padStart(6, '0')}\r\nNOTE:${'x'.repeat(48)}\r\nEND:VCARD`;
  const text = Array.from({ length: contactCount }, (_unused, index) => contact(index)).join(
    '\r\n',
  );
  await page.locator('input[type=file]').setInputFiles({
    name: 'large-generated.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from(text),
  });
  const workerStarted = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Process files' }).click();
  await workerStarted;
  await expect(page.locator('.summary-row')).toContainText(
    `${contactCount.toLocaleString()} contacts`,
  );
  await expect(page.locator('.contact-table tbody tr')).toHaveCount(500);
  await expect(page.getByText(/Showing the first 500 of 4,000/)).toBeVisible();
});

test('keeps VCF viewer details and filters usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vcf-viewer');
  await page.locator('input[type=file]').setInputFiles(sample('contacts-basic.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.getByLabel('Search')).toBeVisible();
  await page.getByText('Sofía Núñez', { exact: true }).click();
  await expect(page.getByText('Northwind Workshop', { exact: true }).last()).toBeVisible();
});

test('combines VCF files without forcing deduplication', async ({ page }) => {
  await page.goto('/vcf-merge');
  await page
    .locator('input[type=file]')
    .setInputFiles([
      vcfFixture('duplicates/exact-duplicate.vcf'),
      vcfFixture('duplicates/same-email.vcf'),
    ]);
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.locator('.summary-row').first()).toContainText('4 readable contacts');
  await expect(page.locator('.summary-row').first()).toContainText(/possible duplicate groups/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download combined VCF without deduplication' }).click();
  const file = await download;
  const path = await file.path();
  expect(path).not.toBeNull();
  expect(readFileSync(path!, 'utf8').match(/BEGIN:VCARD/g)).toHaveLength(4);
});

test('resolves exact contact copies and decreases the derived export count', async ({ page }) => {
  await page.goto('/vcf-duplicate-remover');
  await page
    .locator('input[type=file]')
    .setInputFiles(vcfFixture('duplicates/exact-duplicate.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.locator('.confidence-label', { hasText: 'Exact duplicate' })).toBeVisible();
  await expect(page.locator('.duplicate-output-summary')).toContainText('2 contacts');
  await page.getByRole('button', { name: /Resolve exact duplicates/ }).click();
  await page.getByRole('button', { name: 'Confirm exact resolution' }).click();
  await expect(page.locator('.duplicate-output-summary')).toContainText('1 contact');
  await expect(page.locator('.resolution-status')).toContainText('Exact duplicate copies resolved');
  await expect(page.getByRole('button', { name: 'Download reviewed VCF' })).toBeVisible();
});

test('reviews and merges a likely duplicate with keyboard-operated field choices', async ({
  page,
}) => {
  await page.goto('/vcf-duplicate-remover');
  await page
    .locator('input[type=file]')
    .setInputFiles(vcfFixture('duplicates/merge-conflicts.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  const group = page.locator('.duplicate-group').first();
  const disclosure = group.locator('summary');
  await disclosure.focus();
  await page.keyboard.press('Enter');
  await expect(group.getByText('Same email address')).toBeVisible();
  const review = group.getByRole('button', { name: 'Review merge' });
  await review.focus();
  await page.keyboard.press('Enter');
  const titleChoices = group.getByRole('group', { name: 'Title' });
  const staffTitle = titleChoices
    .locator('label')
    .filter({ hasText: 'Staff Engineer' })
    .locator('input');
  await staffTitle.focus();
  await page.keyboard.press('Space');
  const preview = group.getByRole('button', { name: 'Preview merge' });
  await preview.focus();
  await page.keyboard.press('Enter');
  await expect(group.getByRole('region', { name: 'Result preview' })).toContainText(
    'Staff Engineer',
  );
  const apply = group.getByRole('button', { name: 'Apply merge' });
  await apply.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.duplicate-output-summary')).toContainText('1 of 1 group resolved');
});

test('keeps same-name different people separate by default', async ({ page }) => {
  await page.goto('/vcf-duplicate-remover');
  await page
    .locator('input[type=file]')
    .setInputFiles(vcfFixture('duplicates/same-name-different-person.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await expect(page.locator('.summary-row').first()).toContainText('0 possible groups');
  await expect(page.locator('.duplicate-output-summary')).toContainText('2 contacts');
  await expect(page.getByText('No duplicate groups match these filters.')).toBeVisible();
});

test('resets duplicate resolutions back to original contact state', async ({ page }) => {
  await page.goto('/vcf-duplicate-remover');
  await page
    .locator('input[type=file]')
    .setInputFiles(vcfFixture('duplicates/exact-duplicate.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  await page.getByRole('button', { name: /Resolve exact duplicates/ }).click();
  await page.getByRole('button', { name: 'Confirm exact resolution' }).click();
  await expect(page.locator('.duplicate-output-summary')).toContainText('1 contact');
  await page.getByRole('button', { name: 'Reset all resolutions' }).click();
  await expect(page.locator('.duplicate-output-summary')).toContainText('2 contacts');
  await expect(page.locator('.confidence-label', { hasText: 'Exact duplicate' })).toBeVisible();
});

test('uses a worker and bounds large duplicate review rendering', async ({ page }) => {
  await page.goto('/vcf-duplicate-remover');
  const uniqueCount = 750;
  const duplicateCount = 150;
  const card = (index: number): string =>
    `BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Generated Contact ${index}\r\nN:Contact ${index};Generated;;;\r\nEMAIL:generated${index}@example.test\r\nTEL:+351910${String(index).padStart(6, '0')}\r\nEND:VCARD`;
  const originals = Array.from({ length: uniqueCount }, (_unused, index) => card(index));
  const text = [...originals, ...originals.slice(0, duplicateCount)].join('\r\n');
  await page.locator('input[type=file]').setInputFiles({
    name: 'large-duplicates.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from(text),
  });
  const workerStarted = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Process files' }).click();
  await workerStarted;
  await expect(page.locator('.summary-row').first()).toContainText('150 certain groups');
  await expect(page.locator('.duplicate-group')).toHaveCount(100);
  await expect(page.getByText(/Showing the first 100 of 150/)).toBeVisible();
});

test('cancels local duplicate worker analysis without changing contacts', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(60_000);
  await page.goto('/vcf-duplicate-remover');
  const contactCount = 40_000;
  const text = Array.from(
    { length: contactCount },
    (_unused, index) =>
      `BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Cancel Test ${index}\r\nN:Test ${index};Cancel;;;\r\nEMAIL:cancel${index}@example.test\r\nEND:VCARD`,
  ).join('\r\n');
  await page.locator('input[type=file]').setInputFiles({
    name: 'cancel-worker.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from(text),
  });
  await page.getByRole('button', { name: 'Process files' }).click();
  const cancel = page.getByRole('button', { name: 'Cancel analysis' });
  await cancel.waitFor();
  await cancel.click();
  await expect(page.getByText(/analysis cancelled/i)).toBeVisible();
  await expect(page.locator('.duplicate-group')).toHaveCount(0);
});

test('keeps duplicate comparison and merge fields contained on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vcf-duplicate-remover');
  await page
    .locator('input[type=file]')
    .setInputFiles(vcfFixture('duplicates/merge-conflicts.vcf'));
  await page.getByRole('button', { name: 'Process files' }).click();
  const group = page.locator('.duplicate-group').first();
  await group.locator('summary').click();
  await group.getByRole('button', { name: 'Review merge' }).click();
  await expect(group.getByRole('group', { name: 'Title' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(
    await group
      .locator('.duplicate-comparison')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
});

test('does not display expired or inactive sponsors', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Example Sponsor')).toHaveCount(0);
  await expect(page.getByText('Sponsor this tool').first()).toBeVisible();
});

test('keeps the primary tool usable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ics-viewer');
  await expect(page.getByText(/Your files never leave your device/).first()).toBeVisible();
  await expect(page.getByText('Drop your files here')).toBeInViewport();
});

test('supports keyboard operation of the upload component', async ({ page }) => {
  await page.goto('/vcf-viewer');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.drop-zone').focus();
  await page.keyboard.press('Enter');
  const fileChooser = await chooser;
  await fileChooser.setFiles(sample('contacts-basic.vcf'));
  await expect(page.getByRole('button', { name: 'Process files' })).toBeEnabled();
});
