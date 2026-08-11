import { donationCard } from '../components/DonationCard';
import { privacyBadge } from '../components/PrivacyBadge';
import { formatSponsorPrice } from '../components/SponsorPlacement';
import { isConfiguredValue, siteConfig } from '../config/site';
import { staticMeta } from '../config/seo';
import { routePaths } from '../routePaths';
import { escapeHtml } from '../utils/dom';
import { calculateSponsorInventory } from '../utils/sponsors';

export { staticMeta };

export function formatTraffic(visitors: number | null): string {
  if (visitors === null)
    return 'Traffic statistics will be published here once a reliable baseline is available.';
  return `${new Intl.NumberFormat('en').format(visitors)} monthly visitors`;
}

export function sponsorContactMarkup(email: string = siteConfig.contactEmail): string {
  if (!isConfiguredValue(email))
    return '<p class="notice warning"><strong>Deployment setup required:</strong> configure a real contact email before accepting sponsor enquiries.</p>';
  const safeEmail = escapeHtml(email);
  return `<a class="button primary" href="mailto:${safeEmail}?subject=Calendar%20Contact%20Tools%20sponsorship" data-sponsor-contact>Ask about a placement</a>`;
}

function breadcrumbs(label: string): string {
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="${import.meta.env.BASE_URL}">Home</a><span>/</span><span>${label}</span></nav>`;
}

function privacyPage(): string {
  return `<main id="main-content">${breadcrumbs('Privacy')}<header class="page-heading"><h1>Files stay inside your browser</h1>${privacyBadge()}</header><section class="prose"><h2>Local file processing</h2><p>File selection uses the browser File API. Parsing, filtering, conversion, previews, and downloads run in JavaScript on your device. The site has no application backend, upload endpoint, account system, or file database.</p><h2>What is not collected</h2><p>File contents, filenames, calendar titles, contact names, email addresses, phone numbers, notes, and exports are not sent to us, logged, or stored. File content is never written to localStorage or sessionStorage.</p><h2>Browser storage</h2><p>The only persistent browser setting is your light or dark theme preference. Resetting a tool or closing its tab releases its in-memory file data; the browser may retain an ordinary page cache under its own controls.</p><h2>Sponsors and external links</h2><p>Sponsor artwork is served from this site. Sponsor cards contain no tracking pixels or remote scripts. A sponsor, donation, or source link contacts another site only after you choose it; that destination then applies its own privacy policy.</p><h2>Optional analytics</h2><p>Analytics is disabled by default. If a maintainer deliberately enables an approved privacy-friendly provider, the adapter permits only coarse events such as a tool page view, success or error result, broad file-count bucket, download, or sponsor click. It rejects filenames, file contents, contact data, event data, free-text fields, and unique identifiers.</p><h2>Security boundaries</h2><p>Displayed file values are inserted as text rather than executable markup. A restrictive Content Security Policy is included. Browser extensions, a compromised device, and third-party sites you open remain outside this site’s control.</p><h2>Clearing data</h2><p>Use Reset on the tool, close the tab, or clear ordinary site data using your browser settings. The application does not retain selected files.</p></section></main>`;
}

function sponsorPage(): string {
  const inventory = calculateSponsorInventory()
    .map(
      (item) =>
        `<tr><th scope="row">${item.label}</th><td>${item.available} of ${item.total} available</td></tr>`,
    )
    .join('');
  return `<main id="main-content">${breadcrumbs('Sponsor')}<header class="page-heading"><h1>Reach people working with calendar and contact data</h1><p>Quiet, clearly labeled direct placements support this free project without behavioral advertising.</p></header><section class="pricing-grid"><article><p class="pricing-note">Standard direct placement</p><p class="price">${formatSponsorPrice()}<small>/ month</small></p><p>Bookings are monthly and can be cancelled before the next period. Availability and dates are confirmed before invoicing; there is no automatic billing system.</p>${sponsorContactMarkup()}</article><article><h2>Audience</h2><p>People inspecting, migrating, converting, and cleaning calendars and contacts—including developers, operations teams, CRM users, and productivity professionals.</p><p><strong>Traffic:</strong> ${formatTraffic(siteConfig.monthlyVisitors)}</p></article></section><section class="content-grid"><article><h2>Placement inventory</h2><div class="table-scroll" role="region" aria-label="Sponsor placement inventory" tabindex="0"><table class="inventory-table"><caption class="sr-only">Sponsor placement inventory</caption><thead><tr><th scope="col">Placement</th><th scope="col">Current availability</th></tr></thead><tbody>${inventory}</tbody></table></div><p>Tool-group placements appear only beside relevant calendar or contact utilities. A small footer card may be offered separately after discussion.</p></article><article><h2>Suitable sponsors</h2><p>Good fits include productivity software, calendar services, CRM and contact-management products, privacy software, developer tools, migration services, and relevant data utilities.</p><p>Placements are direct and fixed for an agreed date window. There is no behavioral targeting or auction.</p></article></section><section class="prose"><h2>Placement standards</h2><ul><li>Every paid card is visibly labeled “Sponsor.”</li><li>No tracking pixels, remote scripts, popups, or unexpected creative rotation.</li><li>No imitation download buttons or interference with the uploader.</li><li>Destination links must use HTTPS; artwork is reviewed, optimized, and served locally.</li><li>Claims must be factual, relevant, and appropriate for a general audience.</li><li>Expired placements disappear automatically at the start of their end date.</li></ul><h2>Creative format</h2><div class="sponsor-card example-card"><span class="sponsor-label">Sponsor</span><span class="sponsor-copy"><strong>Your product name</strong><span>A short, factual description of a product relevant to this audience.</span></span><span class="sponsor-action">Visit <span aria-hidden="true">→</span></span></div><p>Send your product name, destination URL, preferred placement, requested month, short description, and a compact logo. The maintainer will confirm fit and availability.</p></section></main>`;
}

function aboutPage(): string {
  const source = isConfiguredValue(siteConfig.githubUrl)
    ? `<p>Inspect the source, report a bug, or contribute at <a href="${escapeHtml(siteConfig.githubUrl)}" target="_blank" rel="noopener noreferrer">the project repository</a>.</p>`
    : '<p class="notice warning">The public source repository link has not been configured for this deployment.</p>';
  const contact = isConfiguredValue(siteConfig.contactEmail)
    ? `<p>Questions and responsible reports can be sent to <a href="mailto:${escapeHtml(siteConfig.contactEmail)}">${escapeHtml(siteConfig.contactEmail)}</a>.</p>`
    : '<p class="notice warning">The public contact email has not been configured for this deployment.</p>';
  return `<main id="main-content">${breadcrumbs('About')}<header class="page-heading"><h1>Small tools, transparent behavior</h1><p>Calendar Contact Tools is a static website for inspecting and transforming common ICS and VCF files without first sending them to a server.</p></header><section class="prose"><h2>Why it exists</h2><p>Calendar and contact files often need a quick inspection, conversion, merge, timezone repair, recurrence check, or duplicate cleanup. Those files can contain sensitive schedules and personal details, so local browser processing is the default.</p><h2>Formats and limitations</h2><p>The calendar tools target common iCalendar 2.0 data, including recurring events and timezone definitions. The contact tools handle common vCard 2.1, 3.0, and 4.0 records. Real exports vary: unsupported vendor extensions are preserved where a transformation allows it, and each tool documents cases that need manual review.</p><h2>Engineering principles</h2><ul><li>No file backend, account, or signup requirement.</li><li>Minimal runtime dependencies and no remotely loaded fonts.</li><li>Visible previews, warnings, and review steps before relevant downloads.</li><li>Keyboard-accessible controls and actionable error recovery.</li><li>Honest explanations of standards and heuristic limitations.</li></ul><h2>Open development</h2>${source}<h2>Contact</h2>${contact}</section>${donationCard()}</main>`;
}

export function staticPage(path: string): string {
  if (path === routePaths.privacy) return privacyPage();
  if (path === routePaths.sponsor) return sponsorPage();
  return aboutPage();
}
