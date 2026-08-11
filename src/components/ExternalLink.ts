import { escapeHtml } from '../utils/dom';

export interface ExternalLinkOptions {
  href: string;
  label: string;
  className?: string;
  sponsored?: boolean;
  dataAttributes?: Record<string, string>;
}

export function safeExternalUrl(href: string): string {
  const url = new URL(href);
  if (url.protocol !== 'https:' && url.protocol !== 'mailto:') {
    throw new Error('External links must use HTTPS or mailto.');
  }
  return url.toString();
}

export function externalLink(options: ExternalLinkOptions): string {
  const href = safeExternalUrl(options.href);
  const isMail = href.startsWith('mailto:');
  const target = isMail ? '' : ' target="_blank"';
  const rel = isMail ? '' : ` rel="${options.sponsored ? 'sponsored ' : ''}noopener noreferrer"`;
  const className = options.className ? ` class="${escapeHtml(options.className)}"` : '';
  const dataAttributes = Object.entries(options.dataAttributes ?? {})
    .map(
      ([key, value]) =>
        ` data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${escapeHtml(value)}"`,
    )
    .join('');
  return `<a${className} href="${escapeHtml(href)}"${target}${rel}${dataAttributes}>${escapeHtml(options.label)}</a>`;
}
