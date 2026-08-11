/// <reference lib="webworker" />

import { analyzeContactDuplicates } from '../duplicateDetection';
import { parseVcf } from '../parser';
import type { ContactWorkerRequest, ContactWorkerResponse } from './protocol';

const cancelled = new Set<string>();
const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener('message', (event: MessageEvent<ContactWorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    cancelled.add(request.requestId);
    return;
  }
  try {
    if (request.type === 'detect-vcf-duplicates') {
      const analysis = analyzeContactDuplicates(request.contacts, {
        ...request.options,
        onStage: (stage) => post({ type: 'duplicate-stage', requestId: request.requestId, stage }),
      });
      post({ type: 'duplicate-success', requestId: request.requestId, analysis });
      return;
    }
    const results = [];
    for (const [index, input] of request.inputs.entries()) {
      if (cancelled.has(request.requestId)) {
        cancelled.delete(request.requestId);
        post({
          type: 'error',
          requestId: request.requestId,
          error: { code: 'CANCELLED', message: 'Contact processing was cancelled.' },
        });
        return;
      }
      results.push(parseVcf(input.text, input.name));
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
        code: request.type === 'detect-vcf-duplicates' ? 'DUPLICATE_FAILED' : 'PARSE_FAILED',
        message: error instanceof Error ? error.message : 'The contacts could not be parsed.',
      },
    });
  }
});

function post(response: ContactWorkerResponse): void {
  worker.postMessage(response);
}

export {};
