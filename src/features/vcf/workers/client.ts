import { vcfLimits } from '../../../config/vcf';
import {
  analyzeContactDuplicates,
  type DuplicateAnalysis,
  type DuplicateAnalysisOptions,
  type DuplicateAnalysisStage,
} from '../duplicateDetection';
import type { Contact, VcfInput, VcfParseResult } from '../model';
import { parseVcf } from '../parser';
import type { ContactWorkerRequest, ContactWorkerResponse } from './protocol';
import { registerRouteCleanup } from '../../../utils/lifecycle';

export interface ParseContactInputsOptions {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, sourceFile: string) => void;
  workerThresholdBytes?: number;
}

export interface AnalyzeContactDuplicatesOptions extends Omit<DuplicateAnalysisOptions, 'onStage'> {
  signal?: AbortSignal;
  workerThresholdContacts?: number;
  onStage?: (stage: DuplicateAnalysisStage) => void;
}

export function shouldUseContactWorker(
  inputs: readonly VcfInput[],
  threshold: number = vcfLimits.workerThresholdBytes,
): boolean {
  const encoder = new TextEncoder();
  return (
    inputs.reduce((total, input) => total + encoder.encode(input.text).byteLength, 0) >= threshold
  );
}

export async function parseContactInputs(
  inputs: VcfInput[],
  options: ParseContactInputsOptions = {},
): Promise<VcfParseResult[]> {
  if (
    typeof Worker === 'undefined' ||
    !shouldUseContactWorker(inputs, options.workerThresholdBytes)
  ) {
    return inputs.map((input, index) => {
      if (options.signal?.aborted)
        throw new DOMException('Contact processing was cancelled.', 'AbortError');
      const result = parseVcf(input.text, input.name);
      options.onProgress?.(index + 1, inputs.length, input.name);
      return result;
    });
  }
  return parseInWorker(inputs, options);
}

export function shouldUseDuplicateWorker(
  contacts: readonly Contact[],
  threshold: number = vcfLimits.duplicateWorkerThresholdContacts,
): boolean {
  return contacts.length >= threshold;
}

export async function analyzeContactDuplicatesAsync(
  contacts: Contact[],
  options: AnalyzeContactDuplicatesOptions = {},
): Promise<DuplicateAnalysis> {
  if (options.signal?.aborted)
    throw new DOMException('Duplicate analysis was cancelled.', 'AbortError');
  if (
    typeof Worker === 'undefined' ||
    !shouldUseDuplicateWorker(contacts, options.workerThresholdContacts)
  )
    return analyzeContactDuplicates(contacts, options);
  return analyzeDuplicatesInWorker(contacts, options);
}

function analyzeDuplicatesInWorker(
  contacts: Contact[],
  options: AnalyzeContactDuplicatesOptions,
): Promise<DuplicateAnalysis> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const worker = new Worker(new URL('./contactWorker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    let unregister = (): void => undefined;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', abort);
      unregister();
      worker.terminate();
    };
    const abort = (): void => {
      worker.postMessage({ type: 'cancel', requestId } satisfies ContactWorkerRequest);
      finish();
      reject(new DOMException('Duplicate analysis was cancelled.', 'AbortError'));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    unregister = registerRouteCleanup(abort);
    worker.addEventListener('message', (event: MessageEvent<ContactWorkerResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) return;
      if (response.type === 'duplicate-stage') {
        options.onStage?.(response.stage);
        return;
      }
      if (response.type === 'progress') return;
      finish();
      if (response.type === 'duplicate-success') resolve(response.analysis);
      else if (response.type === 'error') reject(new Error(response.error.message));
      else reject(new Error('The contact worker returned an unexpected response.'));
    });
    worker.addEventListener('error', () => {
      finish();
      reject(new Error('The background duplicate worker stopped unexpectedly.'));
    });
    const analysisOptions: DuplicateAnalysisOptions = {
      ...(options.maxCandidates === undefined ? {} : { maxCandidates: options.maxCandidates }),
      ...(options.maxWeakBucketSize === undefined
        ? {}
        : { maxWeakBucketSize: options.maxWeakBucketSize }),
      ...(options.maxStrongBucketSize === undefined
        ? {}
        : { maxStrongBucketSize: options.maxStrongBucketSize }),
      ...(options.maxGroupSize === undefined ? {} : { maxGroupSize: options.maxGroupSize }),
    };
    worker.postMessage({
      type: 'detect-vcf-duplicates',
      requestId,
      contacts,
      options: analysisOptions,
    } satisfies ContactWorkerRequest);
  });
}

function parseInWorker(
  inputs: VcfInput[],
  options: ParseContactInputsOptions,
): Promise<VcfParseResult[]> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const worker = new Worker(new URL('./contactWorker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    let unregister = (): void => undefined;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', abort);
      unregister();
      worker.terminate();
    };
    const abort = (): void => {
      worker.postMessage({ type: 'cancel', requestId } satisfies ContactWorkerRequest);
      finish();
      reject(new DOMException('Contact processing was cancelled.', 'AbortError'));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    unregister = registerRouteCleanup(abort);
    worker.addEventListener('message', (event: MessageEvent<ContactWorkerResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) return;
      if (response.type === 'progress') {
        options.onProgress?.(response.completed, response.total, response.sourceFile);
        return;
      }
      finish();
      if (response.type === 'success') resolve(response.results);
      else if (response.type === 'error') reject(new Error(response.error.message));
      else reject(new Error('The contact worker returned an unexpected response.'));
    });
    worker.addEventListener('error', () => {
      finish();
      reject(new Error('The background contact worker stopped unexpectedly.'));
    });
    worker.postMessage({ type: 'parse-vcf', requestId, inputs } satisfies ContactWorkerRequest);
  });
}
