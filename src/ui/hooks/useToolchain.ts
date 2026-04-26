import { useCallback, useRef, useState } from 'react';
import type { InstallPlan } from '../../domain/models/InstallPlan.js';
import type { InstallProgress } from '../../domain/models/InstallProgress.js';
import type { InstallResult } from '../../domain/models/InstallResult.js';
import { ToolchainService } from '../../application/ToolchainService.js';
import { useAppStore } from '../store/useAppStore.js';

type Phase = 'idle' | 'propose' | 'running' | 'done';

export interface ToolchainController {
  phase: Phase;
  plan: InstallPlan | null;
  progress: InstallProgress | null;
  result: InstallResult | null;
  open: () => void;
  confirm: (plan: InstallPlan) => Promise<void>;
  cancel: () => void;
  close: () => void;
}

export function useToolchain(): ToolchainController {
  const snapshot = useAppStore(s => s.snapshot);
  const projects = useAppStore(s => s.projects);
  const pushNotification = useAppStore(s => s.pushNotification);

  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [result, setResult] = useState<InstallResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const open = useCallback(() => {
    if (!snapshot) return;
    const service = new ToolchainService();
    const next = service.plan(snapshot, projects);
    setPlan(next);
    setProgress(null);
    setResult(null);
    setPhase('propose');
  }, [snapshot, projects]);

  const confirm = useCallback(async (confirmed: InstallPlan) => {
    setPlan(confirmed);
    setPhase('running');
    abortRef.current = new AbortController();

    const service = new ToolchainService();
    const final = await service.apply(confirmed, {
      signal: abortRef.current.signal,
      onProgress: (p) => setProgress(p),
    });
    setResult(final);
    setPhase('done');

    pushNotification({
      severity: final.progress.overallStatus === 'done' ? 'ok' : 'danger',
      title:
        final.progress.overallStatus === 'done'
          ? 'Toolchain ready'
          : 'Toolchain install failed',
      detail: `${final.progress.steps.filter(s => s.status === 'done').length}/${confirmed.steps.length} step(s) done`,
      ttlMs: 5000,
    });
  }, [pushNotification]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    if (phase === 'propose') {
      setPhase('idle');
      setPlan(null);
    }
  }, [phase]);

  const close = useCallback(() => {
    setPhase('idle');
    setPlan(null);
    setProgress(null);
    setResult(null);
  }, []);

  return { phase, plan, progress, result, open, confirm, cancel, close };
}
