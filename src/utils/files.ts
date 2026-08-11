import { analytics, currentToolSlug } from './analytics';

export async function readFileText(file: File): Promise<string> {
  if (file.size === 0) throw new Error(`${file.name} is empty.`);
  try {
    return await file.text();
  } catch {
    throw new Error(`${file.name} could not be read. Check its encoding and try again.`);
  }
}

export function downloadText(content: string, filename: string, type: string): void {
  const blob = new Blob([type.startsWith('text/csv') ? '\uFEFF' : '', content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // WebKit can consume the URL after the synthetic click returns. A short delay
  // preserves the download while still guaranteeing deterministic cleanup.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  const tool = currentToolSlug();
  if (tool) analytics.track('tool_download_completed', { tool });
}

export function stem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
}
