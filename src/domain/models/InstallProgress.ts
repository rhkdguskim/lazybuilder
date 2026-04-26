export type InstallStepStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type InstallOverallStatus =
  | 'idle'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface InstallStepProgress {
  stepId: string;
  status: InstallStepStatus;
  bytesDownloaded: number;
  bytesTotal: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  errorMessage: string | null;
  logTail: string[];
}

export interface InstallProgress {
  overallStatus: InstallOverallStatus;
  steps: InstallStepProgress[];
  currentStepId: string | null;
}
