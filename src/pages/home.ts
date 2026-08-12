import { donationCard } from '../components/DonationCard';
import { privacyBadge } from '../components/PrivacyBadge';
import { sponsorPlacement } from '../components/SponsorPlacement';
import { toolRoutes } from '../routes';
import { icon } from '../components/Icon';

export function homePage(): string {
  const tools = (group: 'ics' | 'vcf') =>
    toolRoutes
      .filter((route) => route.group === group)
      .map(
        (route) =>
          `<article class="tool-directory-item"><a href="${import.meta.env.BASE_URL}${route.path.slice(1)}"><span><strong>${route.title}</strong><small>${route.description}</small></span>${icon('arrow-right', 'directory-arrow')}</a></article>`,
      )
      .join('');

  return `<main id="main-content">
    <section class="home-intro"><h1>Calendar &amp; contact file tools</h1><p class="lede">View, convert, merge, and clean ICS and VCF files in your browser.</p>${privacyBadge()}</section>
    <section class="tool-directory" aria-labelledby="tools-heading"><h2 id="tools-heading" class="sr-only">Available tools</h2><div class="tool-group"><header>${icon('calendar', 'category-icon')}<span><span class="file-kind">.ics</span><h2>Calendar</h2></span></header><div class="tool-list">${tools('ics')}</div></div>
    <div class="tool-group"><header>${icon('contact', 'category-icon')}<span><span class="file-kind">.vcf</span><h2>Contacts</h2></span></header><div class="tool-list">${tools('vcf')}</div></div></section>
    ${sponsorPlacement('homepage')}
    ${donationCard()}
  </main>`;
}
