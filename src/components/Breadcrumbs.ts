import { escapeHtml } from '../utils/dom';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function breadcrumbs(items: readonly BreadcrumbItem[]): string {
  const home: BreadcrumbItem = { label: 'Home', href: import.meta.env.BASE_URL };
  const allItems = [home, ...items];
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${allItems
    .map((item, index) => {
      const current = index === allItems.length - 1;
      const content =
        item.href && !current
          ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`
          : `<span${current ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}</span>`;
      return `<li>${content}</li>`;
    })
    .join('')}</ol></nav>`;
}
