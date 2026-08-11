import { siteConfig } from '../config/site';

export function siteHeader(): string {
  return `<a class="skip-link" href="#main-content">Skip to main content</a>
    <header class="site-header">
      <a class="brand" href="${import.meta.env.BASE_URL}" aria-label="${siteConfig.siteName} home"><span class="brand-mark" aria-hidden="true">C·C</span><span>Calendar Contact <strong>Tools</strong></span></a>
      <nav aria-label="Primary"><a href="${import.meta.env.BASE_URL}ics-viewer">Calendar tools</a><a href="${import.meta.env.BASE_URL}vcf-viewer">Contact tools</a><a href="${import.meta.env.BASE_URL}sponsor">Sponsor</a><a href="${import.meta.env.BASE_URL}about">About</a></nav>
      <button class="theme-toggle" type="button" aria-label="Toggle light and dark mode" title="Toggle theme" aria-pressed="false">◐</button>
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
