import { siteConfig } from '../config/site';
import type { Placement } from '../types';
import type { Sponsor } from '../types';
import { analytics } from '../utils/analytics';
import { escapeHtml } from '../utils/dom';
import { activeSponsors } from '../utils/sponsors';
import { safeExternalUrl } from './ExternalLink';
import { icon } from './Icon';

export function sponsorPlacement(placement: Placement, limit = 2): string {
  const sponsors = activeSponsors(placement).slice(0, limit);
  if (!sponsors.length) {
    return `<aside class="sponsor-area" aria-label="Sponsor opportunity"><a class="sponsor-card sponsor-fallback" href="${import.meta.env.BASE_URL}sponsor" data-sponsor-link data-sponsor-placement="${placement}">
      <span class="sponsor-label">Sponsor opportunity</span><span class="sponsor-copy"><strong>Sponsor this tool</strong>
      <span>Calendar and contact professionals · ${formatSponsorPrice()} / month · no tracking pixels</span></span><span class="sponsor-action">Details ${icon('arrow-right')}</span>
    </a></aside>`;
  }
  return `<aside class="sponsor-area" aria-label="Sponsors">${sponsors
    .map((sponsor) => sponsorCardMarkup(sponsor, placement))
    .join('')}</aside>`;
}

export function sponsorCardMarkup(sponsor: Sponsor, placement: Placement): string {
  return `<a class="sponsor-card" href="${escapeHtml(safeExternalUrl(sponsor.url))}" target="_blank" rel="sponsored noopener noreferrer" data-sponsor-link data-sponsor-placement="${placement}">
    <span class="sponsor-label">${escapeHtml(sponsor.label)}</span><img src="${import.meta.env.BASE_URL}${escapeHtml(sponsor.image.replace(/^\//, ''))}" alt="" width="40" height="40" loading="lazy" />
    <span class="sponsor-copy"><strong>${escapeHtml(sponsor.name)}</strong><span>${escapeHtml(sponsor.description)}</span></span><span class="sponsor-action">Visit ${icon('arrow-right')}</span></a>`;
}

export function bindSponsorTracking(root: ParentNode = document): void {
  root.querySelectorAll('[data-sponsor-link]').forEach((link) =>
    link.addEventListener('click', () => {
      const placement = (link as HTMLElement).dataset.sponsorPlacement;
      if (placement) analytics.track('sponsor_clicked', { placement });
    }),
  );
}

export function formatSponsorPrice(): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: siteConfig.sponsorCurrency,
    maximumFractionDigits: 0,
  }).format(siteConfig.sponsorPrice);
}
