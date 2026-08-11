import { isConfiguredValue, siteConfig } from '../config/site';
import { externalLink } from './ExternalLink';
import { sponsorPlacement } from './SponsorPlacement';

export function siteFooter(): string {
  const source = isConfiguredValue(siteConfig.githubUrl)
    ? externalLink({ href: siteConfig.githubUrl, label: 'Source code' })
    : '';
  return `<footer class="site-footer"><div><a class="brand compact" href="${import.meta.env.BASE_URL}"><span class="brand-mark" aria-hidden="true">C·C</span><span>${siteConfig.siteName}</span></a><p>Local browser utilities for common calendar and contact files.</p></div><nav aria-label="Footer"><a href="${import.meta.env.BASE_URL}about">About</a><a href="${import.meta.env.BASE_URL}privacy">Privacy</a><a href="${import.meta.env.BASE_URL}sponsor">Sponsor</a>${source}</nav>${sponsorPlacement('footer', 1)}</footer>`;
}
