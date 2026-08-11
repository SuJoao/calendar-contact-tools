import { el } from '../utils/dom';

export function showSummary(
  root: HTMLElement,
  heading: string,
  stats: string[],
  warnings: string[],
): void {
  root.replaceChildren();
  root.append(el('h2', {}, heading));
  const row = el('div', { class: 'summary-row' });
  stats.forEach((stat) => row.append(el('span', {}, stat)));
  root.append(row);
  if (warnings.length) {
    const box = el('div', { class: 'notice warning', role: 'status' });
    box.append(el('strong', {}, 'Review these notes'));
    const list = el('ul');
    warnings.forEach((warning) => list.append(el('li', {}, warning)));
    box.append(list);
    root.append(box);
  }
}

export function addDownload(root: HTMLElement, text: string, callback: () => void): void {
  const button = el('button', { type: 'button', class: 'button primary download-button' }, text);
  button.addEventListener('click', callback);
  root.append(button);
}

export function preBlock(heading: string, text: string): HTMLElement {
  const wrapper = el('div');
  wrapper.append(el('h3', {}, heading), el('pre', {}, text));
  return wrapper;
}

export function selectedColumns(): string[] {
  const selected = [
    ...document.querySelectorAll<HTMLInputElement>('input[name=column]:checked'),
  ].map((input) => input.value);
  if (!selected.length) throw new Error('Choose at least one export column.');
  return selected;
}

export function label(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}
