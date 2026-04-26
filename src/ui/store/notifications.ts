import type { Severity } from '../themes/theme.js';

export interface Notification {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
  /** Auto-dismiss after this many ms. undefined = sticky. */
  ttlMs?: number;
  /** Optional one-shot keyboard action. */
  action?: { key: string; label: string };
}

export interface PushNotificationInput {
  severity: Severity;
  title: string;
  detail?: string;
  ttlMs?: number;
  action?: { key: string; label: string };
}

let counter = 0;
export function nextNotificationId(): string {
  counter += 1;
  return `n-${Date.now()}-${counter}`;
}
