import { isConfiguredValue, siteConfig } from '../config/site';
import { externalLink } from './ExternalLink';

export function donationCard(): string {
  const links = [
    isConfiguredValue(siteConfig.koFiUrl)
      ? externalLink({
          href: siteConfig.koFiUrl,
          label: 'Ko-fi',
          className: 'button secondary donation-link',
          dataAttributes: { donationProvider: 'ko-fi' },
        })
      : '',
    isConfiguredValue(siteConfig.githubSponsorsUrl)
      ? externalLink({
          href: siteConfig.githubSponsorsUrl,
          label: 'GitHub Sponsors',
          className: 'text-link donation-link',
          dataAttributes: { donationProvider: 'github-sponsors' },
        })
      : '',
  ].filter(Boolean);
  if (!links.length) return '';
  return `<aside class="donation-card" aria-label="Support maintenance">
    <p><strong>Useful tool?</strong> Support its maintenance with a small donation.</p>
    <div class="button-row">${links.join('')}</div>
  </aside>`;
}
