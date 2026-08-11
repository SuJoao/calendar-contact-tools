import { el } from '../utils/dom';

export function renderDataTable(
  root: HTMLElement,
  rows: Record<string, unknown>[],
  columns: { key: string; label: string }[],
  emptyText = 'No matching records.',
  caption = 'Results',
): void {
  root.replaceChildren();
  if (!rows.length) {
    root.append(el('p', { class: 'empty-state' }, emptyText));
    return;
  }
  const wrapper = el('div', {
    class: 'table-wrap',
    tabindex: '0',
    role: 'region',
    'aria-label': `${caption} table`,
  });
  const table = el('table');
  table.append(el('caption', { class: 'sr-only' }, caption));
  const head = el('thead');
  const headRow = el('tr');
  columns.forEach((column) => headRow.append(el('th', { scope: 'col' }, column.label)));
  head.append(headRow);
  const body = el('tbody');
  rows.forEach((row) => {
    const tr = el('tr');
    columns.forEach((column) => tr.append(el('td', {}, display(row[column.key]))));
    body.append(tr);
  });
  table.append(head, body);
  wrapper.append(table);
  root.append(wrapper);
}

function display(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value ?? '');
}
