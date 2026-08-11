import { donationCard } from '../components/DonationCard';
import { privacyBadge } from '../components/PrivacyBadge';
import { sponsorPlacement } from '../components/SponsorPlacement';
import { toolRoutes } from '../routes';

export function homePage(): string {
  const tools = (group: 'ics' | 'vcf') =>
    toolRoutes
      .filter((route) => route.group === group)
      .map(
        (route) =>
          `<article class="tool-directory-item"><a href="${import.meta.env.BASE_URL}${route.path.slice(1)}"><span><strong>${route.title}</strong><small>${route.description}</small></span><span class="directory-arrow" aria-hidden="true">→</span></a></article>`,
      )
      .join('');

  return `<main id="main-content">
    <section class="home-intro"><div><h1>Calendar &amp; contact file tools</h1><p class="lede">View, convert, merge, and clean ICS and VCF files directly in your browser.</p>${privacyBadge()}</div><div class="format-summary" aria-label="Supported formats"><span><code>.ics</code> calendars</span><span><code>.vcf</code> contacts</span><span>No account</span></div></section>
    <section class="tool-directory" aria-labelledby="tools-heading"><h2 id="tools-heading" class="sr-only">Available tools</h2><div class="tool-group"><header><span class="file-kind">.ics</span><h2>Calendar tools</h2></header><div class="tool-list">${tools('ics')}</div></div>
    <div class="tool-group"><header><span class="file-kind">.vcf</span><h2>Contact tools</h2></header><div class="tool-list">${tools('vcf')}</div></div></section>
    <section class="privacy-section"><div><h2>Local by design</h2><p>The app reads selected files through browser APIs. There is no upload endpoint, and file contents are never written to analytics or browser storage.</p></div><a class="text-link" href="${import.meta.env.BASE_URL}privacy">How local processing works <span aria-hidden="true">→</span></a></section>
    ${sponsorPlacement('homepage')}
    <section class="content-grid home-notes"><article><h2>Common questions</h2><details><summary>Do I need an account?</summary><p>No. Every tool is immediately available.</p></details><details><summary>What formats are supported?</summary><p>Common iCalendar 2.0 (.ics) and vCard 2.1, 3.0, and 4.0 (.vcf) records are supported, with limitations documented on each page.</p></details></article><article><h2>Review before export</h2><p>Transformations show previews and warnings. Duplicate detection is heuristic, and destructive choices are never applied without review.</p><a class="text-link" href="${import.meta.env.BASE_URL}about">About this project <span aria-hidden="true">→</span></a></article></section>
    ${donationCard()}
  </main>`;
}
