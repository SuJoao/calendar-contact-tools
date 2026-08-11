import type {
  DuplicateAnalysis,
  DuplicateAnalysisOptions,
  DuplicateAnalysisStage,
} from '../duplicateDetection';
import type { Contact, VcfInput, VcfParseResult } from '../model';

export type ContactWorkerRequest =
  | { type: 'parse-vcf'; requestId: string; inputs: VcfInput[] }
  | {
      type: 'detect-vcf-duplicates';
      requestId: string;
      contacts: Contact[];
      options?: Omit<DuplicateAnalysisOptions, 'onStage'>;
    }
  | { type: 'cancel'; requestId: string };

export type ContactWorkerResponse =
  | {
      type: 'progress';
      requestId: string;
      completed: number;
      total: number;
      sourceFile: string;
    }
  | { type: 'success'; requestId: string; results: VcfParseResult[] }
  | {
      type: 'duplicate-stage';
      requestId: string;
      stage: DuplicateAnalysisStage;
    }
  | { type: 'duplicate-success'; requestId: string; analysis: DuplicateAnalysis }
  | {
      type: 'error';
      requestId: string;
      error: { code: 'PARSE_FAILED' | 'DUPLICATE_FAILED' | 'CANCELLED'; message: string };
    };
