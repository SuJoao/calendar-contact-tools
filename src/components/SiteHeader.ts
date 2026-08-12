import { siteConfig } from '../config/site';
import { icon } from './Icon';
import { productMark } from './ProductMark';

export function siteHeader(): string {
  return `<a class="skip-link" href="#main-content">Skip to main content</a>
    <header class="site-header">
      <a class="brand" href="${import.meta.env.BASE_URL}" aria-label="${siteConfig.siteName} home">${productMark()}<span>Calendar Contact <strong>Tools</strong></span></a>
      <nav aria-label="Primary"><a href="${import.meta.env.BASE_URL}ics-viewer">Calendar</a><a href="${import.meta.env.BASE_URL}vcf-viewer">Contacts</a><span class="nav-secondary"><a href="${import.meta.env.BASE_URL}sponsor">Sponsor</a><a href="${import.meta.env.BASE_URL}about">About</a></span></nav>
      <button class="theme-toggle" type="button" aria-label="Switch to dark mode" title="Switch to dark mode" aria-pressed="false">${icon('sun', 'theme-icon theme-icon-light')}${icon('moon', 'theme-icon theme-icon-dark')}</button>
    </header>`;
}

export function bindThemeToggle(root: ParentNode = document): void {
  const button = root.querySelector<HTMLButtonElement>('.theme-toggle');
  if (!button) return;
  const updateState = (): void => {
    const dark =
      document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme &&
        matchMedia('(prefers-color-scheme: dark)').matches);
    button.setAttribute('aria-pressed', String(dark));
    const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    button.setAttribute('aria-label', label);
    button.title = label;
  };
  updateState();
  button.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const dark = current ? current !== 'dark' : !matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('calendar-contact-theme', dark ? 'dark' : 'light');
    updateState();
  });
}
