import { isConfiguredValue, siteConfig } from '../config/site';
import { externalLink } from './ExternalLink';
import { productMark } from './ProductMark';

export function siteFooter(): string {
  const source = isConfiguredValue(siteConfig.githubUrl)
    ? externalLink({ href: siteConfig.githubUrl, label: 'Source code' })
    : '';
  return `<footer class="site-footer"><div><a class="brand compact" href="${import.meta.env.BASE_URL}">${productMark()}<span>${siteConfig.siteName}</span></a><p>Local browser utilities for calendar and contact files.</p></div><nav aria-label="Footer"><a href="${import.meta.env.BASE_URL}about">About</a><a href="${import.meta.env.BASE_URL}privacy">Privacy</a><a href="${import.meta.env.BASE_URL}sponsor">Sponsor</a>${source}</nav></footer>`;
}
