import type { IcsMergeAnalysis } from '../merge';
import type { CalendarInput, IcsParseResult } from '../model';
import type { ExpandRecurrenceRequest, RecurrenceExpansionResult } from '../recurrence';

export type CalendarWorkerRequest =
  | { type: 'parse'; requestId: string; inputs: CalendarInput[] }
  | { type: 'analyze-merge'; requestId: string; inputs: CalendarInput[] }
  | { type: 'expand-recurrence'; requestId: string; expansion: ExpandRecurrenceRequest }
  | { type: 'cancel'; requestId: string };

export type CalendarWorkerResponse =
  | {
      type: 'progress';
      requestId: string;
      completed: number;
      total: number;
      sourceFile: string;
    }
  | { type: 'success'; requestId: string; results: IcsParseResult[] }
  | { type: 'merge-success'; requestId: string; analysis: IcsMergeAnalysis }
  | { type: 'recurrence-success'; requestId: string; result: RecurrenceExpansionResult }
  | {
      type: 'error';
      requestId: string;
      error: { code: 'PARSE_FAILED' | 'EXPANSION_FAILED' | 'CANCELLED'; message: string };
    };
