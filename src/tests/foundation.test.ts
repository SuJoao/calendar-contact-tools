// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { breadcrumbs } from '../components/Breadcrumbs';
import { renderDataTable } from '../components/DataTable';
import { ErrorSummary } from '../components/ErrorSummary';
import { externalLink, safeExternalUrl } from '../components/ExternalLink';
import { FileUploader } from '../components/FileUploader';
import { siteFooter } from '../components/SiteFooter';
import { siteHeader } from '../components/SiteHeader';
import { siteConfig } from '../config/site';
import { homePage } from '../pages/home';
import { staticMeta, staticPage } from '../pages/static';
import { renderToolPage } from '../pages/tools';
import { routeByPath, toolRoutes } from '../routes';
import { plannedRoutePaths } from '../routePaths';

function setFiles(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function createUploader(overrides: Partial<ConstructorParameters<typeof FileUploader>[1]> = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const onFiles = vi.fn();
  const uploader = new FileUploader(root, {
    extensions: ['ics'],
    multiple: true,
    sampleUrl: 'samples/calendar-basic.ics',
    sampleName: 'calendar-basic.ics',
    maxSizeBytes: 20,
    onFiles,
    ...overrides,
  });
  const input = root.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('Test uploader input is missing.');
  return { root, uploader, onFiles, input };
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('foundation configuration and routing', () => {
  it('provides every required configurable site value', () => {
    expect(siteConfig).toMatchObject({
      siteName: expect.any(String),
      siteUrl: expect.stringMatching(/^https:/),
      contactEmail: expect.stringContaining('@'),
      githubUrl: expect.stringMatching(/^https:/),
      koFiUrl: expect.stringMatching(/^https:/),
      githubSponsorsUrl: expect.stringMatching(/^https:/),
      sponsorPrice: expect.any(Number),
      sponsorCurrency: expect.any(String),
      monthlyVisitors: null,
      analyticsProvider: expect.any(String),
      analyticsEnabled: false,
      defaultOgImage: expect.stringMatching(/^\//),
    });
  });

  it('renders every planned tool and informational route with an h1', () => {
    expect(homePage()).toContain('<h1>');
    for (const route of toolRoutes) {
      expect(routeByPath(route.path)).toBe(route);
      const page = renderToolPage(route);
      expect(page).toContain(`<h1>${route.title}</h1>`);
      expect(page).toContain('id="uploader"');
    }
    for (const path of Object.keys(staticMeta)) expect(staticPage(path)).toContain('<h1>');
    expect(new Set([...toolRoutes.map((route) => route.path), ...Object.keys(staticMeta)])).toEqual(
      new Set(plannedRoutePaths),
    );
  });

  it('renders accessible primary/footer navigation and breadcrumbs', () => {
    document.body.innerHTML = `${siteHeader()}${breadcrumbs([{ label: 'Test page' }])}${siteFooter()}`;
    expect(document.querySelector('nav[aria-label="Primary"]')).not.toBeNull();
    expect(document.querySelector('nav[aria-label="Footer"]')).not.toBeNull();
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe('Test page');
    expect(document.querySelector('.skip-link')?.getAttribute('href')).toBe('#main-content');
  });
});

describe('privacy-safe shared components', () => {
  it('creates safe external links and rejects executable protocols', () => {
    expect(externalLink({ href: 'https://example.test/path', label: 'Example' })).toContain(
      'rel="noopener noreferrer"',
    );
    expect(safeExternalUrl('mailto:hello@example.test')).toBe('mailto:hello@example.test');
    expect(() => safeExternalUrl('javascript:alert(1)')).toThrow(/HTTPS or mailto/);
  });

  it('announces and focuses reusable error summaries', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const summary = new ErrorSummary(root);
    summary.show(['Wrong file type']);
    expect(root.getAttribute('role')).toBe('alert');
    expect(root.textContent).toContain('Wrong file type');
    expect(document.activeElement).toBe(root);
    summary.clear();
    expect(root.hidden).toBe(true);
  });

  it('renders table headers and user values as text', () => {
    const root = document.createElement('div');
    renderDataTable(
      root,
      [{ name: '<img src=x onerror=alert(1)>' }],
      [{ key: 'name', label: 'Name' }],
    );
    expect(root.querySelector('th')?.getAttribute('scope')).toBe('col');
    expect(root.querySelector('caption')?.textContent).toBe('Results');
    expect(root.querySelector('td')?.textContent).toContain('<img');
    expect(root.querySelector('td img')).toBeNull();
  });
});

describe('FileUploader', () => {
  it('validates extension, empty files, and configured size limits', () => {
    const { root, input } = createUploader();
    setFiles(input, [
      new File(['x'], 'notes.txt'),
      new File([], 'empty.ics'),
      new File(['x'.repeat(21)], 'large.ics'),
    ]);
    const error = root.querySelector<HTMLElement>('[role=alert]');
    expect(error?.textContent).toContain('choose a .ics file');
    expect(error?.textContent).toContain('file is empty');
    expect(error?.textContent).toContain('larger than the allowed limit');
    expect(document.activeElement).toBe(error);
  });

  it('supports multiple files, individual removal, reset, and processing', async () => {
    const { root, input, onFiles } = createUploader();
    setFiles(input, [new File(['one'], 'one.ics'), new File(['two'], 'two.ics')]);
    expect(root.querySelectorAll('.selected-files li')).toHaveLength(2);
    (root.querySelector('[aria-label="Remove one.ics"]') as HTMLButtonElement).click();
    expect(root.querySelectorAll('.selected-files li')).toHaveLength(1);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Remove two.ics');
    (root.querySelector('.process-button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledOnce());
    (root.querySelector('.reset-button') as HTMLButtonElement).click();
    expect(root.querySelectorAll('.selected-files li')).toHaveLength(0);
  });

  it('operates from the keyboard and exposes a live status region', () => {
    const { root, input } = createUploader();
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    const zone = root.querySelector<HTMLElement>('.drop-zone');
    if (!zone) throw new Error('Test drop zone is missing.');
    zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(click).toHaveBeenCalledOnce();
    expect(root.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('loads a sample through the configured local URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(['sample']) })),
    );
    const { root } = createUploader();
    (root.querySelector('.sample-button') as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(root.querySelector('.selected-files')?.textContent).toContain('calendar-basic.ics'),
    );
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('samples/calendar-basic.ics'));
  });
});
