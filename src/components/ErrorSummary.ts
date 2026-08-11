import { el } from '../utils/dom';

export interface ErrorSummaryOptions {
  heading?: string;
  focusOnShow?: boolean;
}

let summaryId = 0;

export class ErrorSummary {
  private readonly heading: string;
  private readonly focusOnShow: boolean;

  constructor(
    private readonly root: HTMLElement,
    options: ErrorSummaryOptions = {},
  ) {
    this.heading = options.heading ?? 'Please fix the following:';
    this.focusOnShow = options.focusOnShow ?? true;
    const headingId = `error-summary-heading-${++summaryId}`;
    root.classList.add('error-summary');
    root.hidden = true;
    root.tabIndex = -1;
    root.setAttribute('role', 'alert');
    root.setAttribute('aria-live', 'assertive');
    root.setAttribute('aria-labelledby', headingId);
    root.dataset.headingId = headingId;
  }

  show(messages: readonly string[]): void {
    this.clear();
    if (!messages.length) return;

    const heading = el('strong', { id: this.root.dataset.headingId ?? '' }, this.heading);
    const list = el('ul');
    messages.forEach((message) => list.append(el('li', {}, message)));
    this.root.append(heading, list);
    this.root.hidden = false;
    if (this.focusOnShow) this.root.focus();
  }

  clear(): void {
    this.root.replaceChildren();
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }
}
