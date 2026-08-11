import { FileUploader } from '../components/FileUploader';
import { toolLayout } from '../components/ToolLayout';
import { icsOptionsMarkup, isIcsPath, runIcsController } from '../controllers/ics';
import { runVcfController, vcfOptionsMarkup } from '../controllers/vcf';
import type { RouteDefinition } from '../types';
import { el, qs } from '../utils/dom';

export function renderToolPage(route: RouteDefinition): string {
  return toolLayout(route, optionsMarkup(route.path));
}

export function bindToolPage(route: RouteDefinition): void {
  new FileUploader(qs('#uploader'), {
    extensions: route.extensions ?? [],
    multiple: route.multiple ?? false,
    sampleUrl: route.sample ?? '',
    sampleName: route.sample?.split('/').pop() ?? 'sample.txt',
    analyticsTool: route.path.slice(1),
    onFiles: async (files) => runTool(route.path, files),
  });
}

function optionsMarkup(path: string): string {
  return isIcsPath(path) ? icsOptionsMarkup(path) : vcfOptionsMarkup(path);
}

async function runTool(path: string, files: File[]): Promise<void> {
  const result = qs<HTMLElement>('#result');
  result.replaceChildren(el('p', { class: 'processing' }, 'Processing locally…'));
  if (isIcsPath(path)) await runIcsController(path, files, result);
  else await runVcfController(path, files, result);
}
