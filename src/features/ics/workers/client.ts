import { calendarLimits } from '../../../config/calendar';
import type { CalendarInput, IcsParseResult } from '../model';
import { analyzeCalendarMerge, type IcsMergeAnalysis } from '../merge';
import { parseIcs } from '../parser';
import {
  analyzeRecurrence,
  estimateRecurrenceWork,
  expandRecurrences,
  type ExpandRecurrenceRequest,
  type RecurrenceExpansionResult,
} from '../recurrence';
import type { CalendarWorkerRequest, CalendarWorkerResponse } from './protocol';
import { registerRouteCleanup } from '../../../utils/lifecycle';

export interface ParseCalendarInputsOptions {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, sourceFile: string) => void;
  workerThresholdBytes?: number;
}

export function shouldUseCalendarWorker(
  inputs: readonly CalendarInput[],
  threshold: number = calendarLimits.workerThresholdBytes,
): boolean {
  const encoder = new TextEncoder();
  return (
    inputs.reduce((total, input) => total + encoder.encode(input.text).byteLength, 0) >= threshold
  );
}

export async function parseCalendarInputs(
  inputs: CalendarInput[],
  options: ParseCalendarInputsOptions = {},
): Promise<IcsParseResult[]> {
  if (
    typeof Worker === 'undefined' ||
    !shouldUseCalendarWorker(inputs, options.workerThresholdBytes)
  ) {
    return inputs.map((input, index) => {
      if (options.signal?.aborted)
        throw new DOMException('Calendar processing was cancelled.', 'AbortError');
      const result = parseIcs(input.text, input.name);
      options.onProgress?.(index + 1, inputs.length, input.name);
      return result;
    });
  }
  return parseInWorker(inputs, options);
}

export async function analyzeCalendarMergeInputs(
  inputs: CalendarInput[],
  options: ParseCalendarInputsOptions = {},
): Promise<IcsMergeAnalysis> {
  if (options.signal?.aborted)
    throw new DOMException('Calendar processing was cancelled.', 'AbortError');
  if (
    typeof Worker === 'undefined' ||
    !shouldUseCalendarWorker(inputs, options.workerThresholdBytes)
  )
    return analyzeCalendarMerge(inputs);
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const worker = new Worker(new URL('./calendarWorker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    let unregister = (): void => undefined;
    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      options.signal?.removeEventListener('abort', abort);
      unregister();
      worker.terminate();
      return true;
    };
    const abort = (): void => {
      worker.postMessage({ type: 'cancel', requestId } satisfies CalendarWorkerRequest);
      if (finish()) reject(new DOMException('Calendar processing was cancelled.', 'AbortError'));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    unregister = registerRouteCleanup(abort);
    worker.addEventListener('message', (event: MessageEvent<CalendarWorkerResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) return;
      if (response.type === 'progress') return;
      finish();
      if (response.type === 'merge-success') resolve(response.analysis);
      else if (response.type === 'error') reject(new Error(response.error.message));
      else reject(new Error('The merge worker returned an unexpected response.'));
    });
    worker.addEventListener('error', () => {
      finish();
      reject(new Error('The background merge worker stopped unexpectedly.'));
    });
    worker.postMessage({
      type: 'analyze-merge',
      requestId,
      inputs,
    } satisfies CalendarWorkerRequest);
  });
}

export interface ExpandRecurrenceOptions {
  signal?: AbortSignal;
  workerThreshold?: number;
}

export function shouldUseRecurrenceWorker(
  request: ExpandRecurrenceRequest,
  threshold: number = calendarLimits.recurrenceWorkerThreshold,
): boolean {
  const analysis = analyzeRecurrence(request.events);
  const selected = request.seriesIds?.length
    ? analysis.series.filter((series) => request.seriesIds!.includes(series.id))
    : analysis.series;
  return estimateRecurrenceWork(selected, request.rangeStart, request.rangeEnd) >= threshold;
}

export async function expandRecurrencesAsync(
  request: ExpandRecurrenceRequest,
  options: ExpandRecurrenceOptions = {},
): Promise<RecurrenceExpansionResult> {
  if (options.signal?.aborted)
    throw new DOMException('Recurrence expansion was cancelled.', 'AbortError');
  if (typeof Worker === 'undefined' || !shouldUseRecurrenceWorker(request, options.workerThreshold))
    return expandRecurrences(request);
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const worker = new Worker(new URL('./calendarWorker.ts', import.meta.url), { type: 'module' });
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
      worker.postMessage({ type: 'cancel', requestId } satisfies CalendarWorkerRequest);
      finish();
      reject(new DOMException('Recurrence expansion was cancelled.', 'AbortError'));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    unregister = registerRouteCleanup(abort);
    worker.addEventListener('message', (event: MessageEvent<CalendarWorkerResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId || response.type === 'progress') return;
      finish();
      if (response.type === 'recurrence-success') resolve(response.result);
      else if (response.type === 'error') reject(new Error(response.error.message));
      else reject(new Error('The recurrence worker returned an unexpected response.'));
    });
    worker.addEventListener('error', () => {
      finish();
      reject(new Error('The background recurrence worker stopped unexpectedly.'));
    });
    worker.postMessage({
      type: 'expand-recurrence',
      requestId,
      expansion: request,
    } satisfies CalendarWorkerRequest);
  });
}

function parseInWorker(
  inputs: CalendarInput[],
  options: ParseCalendarInputsOptions,
): Promise<IcsParseResult[]> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const worker = new Worker(new URL('./calendarWorker.ts', import.meta.url), { type: 'module' });
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
      const request: CalendarWorkerRequest = { type: 'cancel', requestId };
      worker.postMessage(request);
      finish();
      reject(new DOMException('Calendar processing was cancelled.', 'AbortError'));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    unregister = registerRouteCleanup(abort);
    worker.addEventListener('message', (event: MessageEvent<CalendarWorkerResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) return;
      if (response.type === 'progress') {
        options.onProgress?.(response.completed, response.total, response.sourceFile);
        return;
      }
      finish();
      if (response.type === 'success') resolve(response.results);
      else if (response.type === 'error') reject(new Error(response.error.message));
      else reject(new Error('The calendar worker returned an unexpected response.'));
    });
    worker.addEventListener('error', () => {
      finish();
      reject(new Error('The background calendar worker stopped unexpectedly.'));
    });
    const request: CalendarWorkerRequest = { type: 'parse', requestId, inputs };
    worker.postMessage(request);
  });
}
