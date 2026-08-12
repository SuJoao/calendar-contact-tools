import { icon } from './Icon';

export function privacyBadge(): string {
  return `<div class="privacy-badge" role="note">${icon('shield-check')}<span><strong>Processed locally.</strong> Files stay in this browser.</span></div>`;
}
