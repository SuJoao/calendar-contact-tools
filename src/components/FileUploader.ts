import { siteConfig } from '../config/site';
import { analytics, inputCountBucket } from '../utils/analytics';
import { el } from '../utils/dom';
import { ErrorSummary } from './ErrorSummary';
import { icon } from './Icon';

export interface FileUploaderOptions {
  extensions: string[];
  multiple: boolean;
  sampleUrl: string;
  sampleName: string;
  maxSizeBytes?: number;
  analyticsTool?: string;
  onFiles: (files: File[]) => Promise<void> | void;
}

export class FileUploader {
  private files: File[] = [];
  private readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLUListElement;
  private readonly errors: ErrorSummary;
  private readonly status: HTMLDivElement;
  private readonly processButton: HTMLButtonElement;
  private readonly options: FileUploaderOptions;

  constructor(root: HTMLElement, options: FileUploaderOptions) {
    this.root = root;
    this.options = options;
    const fileType = options.extensions.map((extension) => `.${extension}`).join(' / ');
    // SECURITY: this is a fixed application template. File names and all other
    // file-derived values are added later with textContent-backed DOM helpers.
    root.innerHTML = `<div class="upload-shell">
      <div data-error-summary></div>
      <label class="drop-zone" tabindex="0">
        <input class="sr-only file-input" type="file" ${options.multiple ? 'multiple' : ''} accept="${options.extensions.map((e) => `.${e}`).join(',')}" />
        <span class="upload-icon">${icon('upload')}</span><span class="upload-copy"><strong>Drop ${options.multiple ? 'your files' : `your ${fileType} file`} here</strong><small>${fileType} · up to ${Math.round((options.maxSizeBytes ?? siteConfig.maxFileSizeBytes) / 1024 / 1024)} MB each · processed locally</small></span>
        <span class="button primary choose-control">Choose ${options.multiple ? 'files' : 'file'}</span>
      </label>
      <div class="upload-actions"><button class="text-button sample-button" type="button">Use sample</button><button class="text-button reset-button" type="button" hidden>Reset</button></div>
      <ul class="selected-files" aria-label="Selected files"></ul>
      <button class="button primary process-button" type="button" hidden>Process ${options.multiple ? 'files' : 'file'}</button>
      <div class="sr-only upload-status" aria-live="polite"></div>
    </div>`;
    this.input = root.querySelector<HTMLInputElement>('.file-input')!;
    this.list = root.querySelector<HTMLUListElement>('.selected-files')!;
    this.errors = new ErrorSummary(root.querySelector<HTMLElement>('[data-error-summary]')!);
    this.status = root.querySelector<HTMLDivElement>('.upload-status')!;
    this.processButton = root.querySelector<HTMLButtonElement>('.process-button')!;
    this.bind();
  }

  private bind(): void {
    const zone = this.root.querySelector<HTMLElement>('.drop-zone')!;
    this.input.addEventListener('change', () => this.addFiles([...(this.input.files ?? [])]));
    zone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.input.click();
      }
    });
    for (const type of ['dragenter', 'dragover'])
      zone.addEventListener(type, (event) => {
        event.preventDefault();
        zone.classList.add('dragging');
      });
    for (const type of ['dragleave', 'drop'])
      zone.addEventListener(type, (event) => {
        event.preventDefault();
        zone.classList.remove('dragging');
      });
    zone.addEventListener('drop', (event) =>
      this.addFiles([...((event as DragEvent).dataTransfer?.files ?? [])]),
    );
    this.root.querySelector('.reset-button')!.addEventListener('click', () => this.reset());
    this.root
      .querySelector('.sample-button')!
      .addEventListener('click', () => void this.loadSample());
    this.processButton.addEventListener('click', () => void this.process());
  }

  private addFiles(candidates: File[]): void {
    const errors: string[] = [];
    for (const file of candidates) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!this.options.extensions.includes(extension)) {
        errors.push(
          `${file.name}: choose a ${this.options.extensions.map((e) => `.${e}`).join(' or ')} file.`,
        );
        continue;
      }
      if (file.size === 0) {
        errors.push(`${file.name}: the file is empty.`);
        continue;
      }
      if (file.size > (this.options.maxSizeBytes ?? siteConfig.maxFileSizeBytes)) {
        errors.push(`${file.name}: the file is larger than the allowed limit.`);
        continue;
      }
      if (!this.options.multiple) this.files = [];
      if (this.files.length >= siteConfig.maxFiles) {
        errors.push(`You can process up to ${siteConfig.maxFiles} files at once.`);
        break;
      }
      this.files.push(file);
    }
    this.showErrors(errors);
    this.renderList();
  }

  private renderList(): void {
    this.list.replaceChildren();
    this.files.forEach((file, index) => {
      const item = el('li');
      const detail = el('span');
      detail.append(el('strong', {}, file.name), el('small', {}, formatBytes(file.size)));
      const remove = el(
        'button',
        { type: 'button', 'aria-label': `Remove ${file.name}` },
        'Remove',
      );
      remove.className = 'text-button';
      remove.addEventListener('click', () => {
        this.files.splice(index, 1);
        this.renderList();
        const remaining = this.list.querySelectorAll<HTMLButtonElement>('button');
        (
          remaining[Math.min(index, remaining.length - 1)] ??
          this.root.querySelector<HTMLElement>('.drop-zone')
        )?.focus();
      });
      item.append(detail, remove);
      this.list.append(item);
    });
    const disabled = this.files.length === 0;
    this.processButton.disabled = disabled;
    this.processButton.hidden = disabled;
    (this.root.querySelector('.reset-button') as HTMLButtonElement).hidden = disabled;
    this.root.querySelector('.upload-shell')?.classList.toggle('has-files', !disabled);
    this.status.textContent = disabled
      ? 'No files selected.'
      : `${this.files.length} file${this.files.length === 1 ? '' : 's'} selected.`;
  }

  private showErrors(messages: string[]): void {
    if (messages.length) this.errors.show(messages);
    else this.errors.clear();
  }

  private async loadSample(): Promise<void> {
    try {
      this.setBusy(true, 'Loading sample…');
      const response = await fetch(
        `${import.meta.env.BASE_URL}${this.options.sampleUrl.replace(/^\//, '')}`,
      );
      if (!response.ok) throw new Error('The sample file is unavailable.');
      const file = new File([await response.blob()], this.options.sampleName, {
        type: 'text/plain',
      });
      this.files = this.options.multiple ? [...this.files, file] : [file];
      this.showErrors([]);
      this.renderList();
      if (this.options.analyticsTool)
        analytics.track('sample_file_used', { tool: this.options.analyticsTool });
    } catch (error) {
      this.showErrors([error instanceof Error ? error.message : 'Could not load the sample.']);
    } finally {
      this.setBusy(false);
    }
  }

  private async process(): Promise<void> {
    try {
      this.setBusy(true, 'Processing locally…');
      this.showErrors([]);
      await this.options.onFiles([...this.files]);
      this.status.textContent = 'Processing complete.';
      if (this.options.analyticsTool)
        analytics.track('processing_completed', {
          tool: this.options.analyticsTool,
          result: 'success',
          input_count_bucket: inputCountBucket(this.files.length),
        });
    } catch (error) {
      this.showErrors([
        error instanceof Error ? error.message : 'The files could not be processed.',
      ]);
      this.status.textContent = 'Processing failed.';
      if (this.options.analyticsTool)
        analytics.track('processing_completed', {
          tool: this.options.analyticsTool,
          result: 'error',
          input_count_bucket: inputCountBucket(this.files.length),
        });
    } finally {
      this.setBusy(false);
    }
  }

  private setBusy(busy: boolean, message = ''): void {
    this.processButton.disabled = busy || this.files.length === 0;
    this.input.disabled = busy;
    this.processButton.textContent = busy
      ? 'Processing…'
      : `Process ${this.options.multiple ? 'files' : 'file'}`;
    this.root.setAttribute('aria-busy', String(busy));
    if (message) this.status.textContent = message;
  }

  reset(): void {
    this.files = [];
    this.input.value = '';
    this.showErrors([]);
    this.renderList();
  }
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
