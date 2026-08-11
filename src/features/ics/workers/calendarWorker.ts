/// <reference lib="webworker" />

import { parseIcs } from '../parser';
import { analyzeCalendarMerge } from '../merge';
import { expandRecurrences } from '../recurrence';
import type { CalendarWorkerRequest, CalendarWorkerResponse } from './protocol';

const cancelled = new Set<string>();
const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener('message', (event: MessageEvent<CalendarWorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    cancelled.add(request.requestId);
    return;
  }
  try {
    if (request.type === 'analyze-merge') {
      post({
        type: 'merge-success',
        requestId: request.requestId,
        analysis: analyzeCalendarMerge(request.inputs),
      });
      return;
    }
    if (request.type === 'expand-recurrence') {
      post({
        type: 'recurrence-success',
        requestId: request.requestId,
        result: expandRecurrences(request.expansion),
      });
      return;
    }
    const results = [];
    for (const [index, input] of request.inputs.entries()) {
      if (cancelled.has(request.requestId)) {
        post({
          type: 'error',
          requestId: request.requestId,
          error: { code: 'CANCELLED', message: 'Calendar processing was cancelled.' },
        });
        cancelled.delete(request.requestId);
        return;
      }
      results.push(parseIcs(input.text, input.name));
      post({
        type: 'progress',
        requestId: request.requestId,
        completed: index + 1,
        total: request.inputs.length,
        sourceFile: input.name,
      });
    }
    post({ type: 'success', requestId: request.requestId, results });
  } catch (error) {
    post({
      type: 'error',
      requestId: request.requestId,
      error: {
        code: request.type === 'expand-recurrence' ? 'EXPANSION_FAILED' : 'PARSE_FAILED',
        message: error instanceof Error ? error.message : 'The calendar could not be parsed.',
      },
    });
  }
});

function post(response: CalendarWorkerResponse): void {
  worker.postMessage(response);
}

export {};
