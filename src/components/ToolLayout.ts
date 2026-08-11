import type { RouteDefinition } from '../types';
import { toolContent } from '../content/toolContent';
import { toolRoutes } from '../routes';
import { escapeHtml } from '../utils/dom';
import { donationCard } from './DonationCard';
import { privacyBadge } from './PrivacyBadge';
import { sponsorPlacement } from './SponsorPlacement';
import { breadcrumbs } from './Breadcrumbs';

export function toolLayout(route: RouteDefinition, content = ''): string {
  const placement = route.group === 'ics' ? 'ics-tools' : 'vcf-tools';
  const guide = toolContent[route.path];
  if (!guide) throw new Error(`Tool content is missing for ${route.path}.`);
  const list = (items: string[]): string =>
    items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const related = guide.related
    .map((path) => toolRoutes.find((candidate) => candidate.path === path))
    .filter((candidate): candidate is RouteDefinition => Boolean(candidate))
    .map(
      (candidate) =>
        `<a href="${import.meta.env.BASE_URL}${candidate.path.slice(1)}">${escapeHtml(candidate.title)}</a>`,
    )
    .join('');
  return `${breadcrumbs([{ label: route.title }])}
    <main id="main-content"><header class="page-heading"><h1>${route.title}</h1><p>${route.description}</p>${privacyBadge()}</header>
    <section class="tool-card" aria-label="${route.title}"><div id="tool-options">${content}</div><div id="uploader"></div><div id="result" class="result-area" aria-live="polite"></div></section>
    ${sponsorPlacement(placement)}
    <section class="content-grid tool-guide"><article><h2>How to use this tool</h2><ol>${list(guide.steps)}</ol></article><article><h2>${escapeHtml(guide.overviewHeading)}</h2>${guide.overview.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}<ul class="compact-list">${list(guide.details)}</ul></article></section>
    <section class="content-grid tool-reference"><article><h2>${escapeHtml(guide.problemsHeading)}</h2><ul>${list(guide.problems)}</ul></article><article><h2>Frequently asked questions</h2>${guide.faqs.map((faq) => `<details><summary>${escapeHtml(faq.question)}</summary><p>${escapeHtml(faq.answer)}</p></details>`).join('')}</article></section>
    <section class="related-tools"><h2>Related tools</h2><div>${related}</div></section>${donationCard()}</main>`;
}
