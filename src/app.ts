import { analytics } from './utils/analytics';
import { bindSponsorTracking } from './components/SponsorPlacement';
import { siteConfig } from './config/site';
import {
  canonicalUrl,
  metadataForPath,
  notFoundMeta,
  ogImageUrl,
  staticMeta,
  structuredDataForPath,
} from './config/seo';
import type { PageMetadata } from './config/seo';
import { homePage } from './pages/home';
import { staticPage } from './pages/static';
import { bindToolPage, renderToolPage } from './pages/tools';
import { routeByPath } from './routes';
import { siteHeader, bindThemeToggle } from './components/SiteHeader';
import { siteFooter } from './components/SiteFooter';
import { cleanupRouteResources } from './utils/lifecycle';

const appNode = document.querySelector<HTMLElement>('#app');
if (!appNode) throw new Error('Application root is missing.');
const app: HTMLElement = appNode;

export function renderApp(): void {
  cleanupRouteResources();
  const path = currentPath();
  const tool = routeByPath(location.pathname);
  const meta = metadataForPath(path) ?? notFoundMeta;
  const content = tool
    ? renderToolPage(tool)
    : path === '/'
      ? homePage()
      : staticMeta[path]
        ? staticPage(path)
        : notFound();
  // SECURITY: renderers return application-owned templates. User file contents
  // are mounted afterward through textContent-backed components and controllers.
  app.innerHTML = `${siteHeader()}${content}${siteFooter()}`;
  updateMeta(meta, path);
  bindGlobal();
  if (tool) {
    bindToolPage(tool);
    analytics.track('tool_page_view', { tool: tool.path.slice(1) });
  }
  if (path === '/sponsor') analytics.track('sponsor_page_view');
  window.scrollTo({
    top: 0,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
}

function bindGlobal(): void {
  bindSponsorTracking(app);
  app.querySelectorAll('.donation-link').forEach((link) =>
    link.addEventListener('click', () => {
      const provider = (link as HTMLElement).dataset.donationProvider;
      if (provider === 'ko-fi' || provider === 'github-sponsors')
        analytics.track('donation_clicked', { provider });
    }),
  );
  app
    .querySelectorAll('[data-sponsor-contact]')
    .forEach((link) =>
      link.addEventListener('click', () => analytics.track('sponsor_contact_clicked')),
    );
  bindThemeToggle(app);
}

function updateMeta(meta: PageMetadata, path: string): void {
  document.title = meta.title;
  setMeta('name', 'description', meta.description);
  setMeta('name', 'robots', meta.indexable ? 'index,follow' : 'noindex,nofollow');
  setMeta('property', 'og:title', meta.title);
  setMeta('property', 'og:description', meta.description);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', siteConfig.siteName);
  setMeta('property', 'og:url', canonicalUrl(path));
  setMeta('property', 'og:image', ogImageUrl());
  setMeta('property', 'og:image:width', '1200');
  setMeta('property', 'og:image:height', '630');
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', meta.title);
  setMeta('name', 'twitter:description', meta.description);
  setMeta('name', 'twitter:image', ogImageUrl());
  const canonical =
    document.querySelector<HTMLLinkElement>('link[rel=canonical]') ??
    document.head.appendChild(document.createElement('link'));
  canonical.rel = 'canonical';
  if (meta.indexable) canonical.href = canonicalUrl(path);
  else canonical.remove();
  const structured = document.querySelector<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  if (structured) structured.textContent = JSON.stringify(structuredDataForPath(path));
}

function setMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, key);
    document.head.append(meta);
  }
  meta.content = content;
}

function currentPath(): string {
  let path = location.pathname;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (base && path.startsWith(base)) path = path.slice(base.length);
  path = `/${path.replace(/^\/+|\/+$/g, '')}`;
  return path === '/' ? '/' : path;
}

function notFound(): string {
  return `<main id="main-content" class="not-found"><p class="status-code">Error 404</p><h1>That page is not here</h1><p>The address may be outdated. Your files have not been read or uploaded.</p><div class="button-row"><a class="button primary" href="${import.meta.env.BASE_URL}">Return home</a><a class="button secondary" href="${import.meta.env.BASE_URL}ics-viewer">Calendar tools</a><a class="text-link" href="${import.meta.env.BASE_URL}vcf-viewer">Contact tools</a></div></main>`;
}

document.addEventListener('click', (event) => {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a');
  if (
    !link ||
    link.target ||
    link.download ||
    link.origin !== location.origin ||
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey
  )
    return;
  const base = import.meta.env.BASE_URL;
  if (!link.pathname.startsWith(base)) return;
  event.preventDefault();
  history.pushState({}, '', link.href);
  renderApp();
});
window.addEventListener('popstate', renderApp);
