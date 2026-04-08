import { useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore.js';
import { BuildService } from '../../application/BuildService.js';
import type { BuildProfile } from '../../domain/models/BuildProfile.js';
import type { ProjectInfo } from '../../domain/models/ProjectInfo.js';
import type { LogEntry } from '../../domain/models/LogEntry.js';

export function useBuild() {
  const snapshot = useAppStore(s => s.snapshot);
  const status = useAppStore(s => s.buildStatus);
  const result = useAppStore(s => s.buildResult);
  const setBuildStatus = useAppStore(s => s.setBuildStatus);
  const setBuildStartTime = useAppStore(s => s.setBuildStartTime);
  const setBuildResult = useAppStore(s => s.setBuildResult);
  const addBuildHistory = useAppStore(s => s.addBuildHistory);
  const appendLogEntries = useAppStore(s => s.appendLogEntries);
  const clearLogs = useAppStore(s => s.clearLogs);
  const setBuildCancelFn = useAppStore(s => s.setBuildCancelFn);

  const serviceRef = useRef<BuildService | null>(null);

  // Batch log entries for performance (16ms debounce)
  const pendingEntries = useRef<LogEntry[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushLogs = useCallback(() => {
    if (pendingEntries.current.length > 0) {
      appendLogEntries([...pendingEntries.current]);
      pendingEntries.current = [];
    }
    flushTimer.current = null;
  }, [appendLogEntries]);

  const onLogEntry = useCallback((entry: LogEntry) => {
    pendingEntries.current.push(entry);
    if (!flushTimer.current) {
      flushTimer.current = setTimeout(flushLogs, 16);
    }
  }, [flushLogs]);

  const start = useCallback(async (project: ProjectInfo, profile: BuildProfile) => {
    if (!snapshot) return;

    clearLogs();
    setBuildStatus('running');
    setBuildStartTime(Date.now());
    setBuildResult(null);

    const service = new BuildService(snapshot);
    serviceRef.current = service;

    // Register cancel function globally so quit can use it
    setBuildCancelFn(async () => {
      await service.cancel();
    });

    try {
      const buildResult = await service.execute(project, profile, snapshot, onLogEntry);

      // Flush remaining logs
      flushLogs();

      setBuildResult(buildResult);
      addBuildHistory(buildResult);
      setBuildStatus(buildResult.status === 'success' ? 'success' : 'failure');
    } catch {
      setBuildStatus('failure');
    } finally {
      setBuildCancelFn(null);
      setBuildStartTime(null);
    }
  }, [snapshot, clearLogs, setBuildStatus, setBuildStartTime, setBuildResult, addBuildHistory, onLogEntry, flushLogs, setBuildCancelFn]);

  const cancel = useCallback(async () => {
    if (serviceRef.current) {
      await serviceRef.current.cancel();
      setBuildCancelFn(null);
      setBuildStatus('cancelled');
      setBuildStartTime(null);
    }
  }, [setBuildCancelFn, setBuildStatus, setBuildStartTime]);

  const resolveCommand = useCallback((project: ProjectInfo, profile: BuildProfile) => {
    if (!snapshot) return null;
    const service = new BuildService(snapshot);
    return service.resolveCommand(project, profile);
  }, [snapshot]);

  return { status, result, start, cancel, resolveCommand };
}
