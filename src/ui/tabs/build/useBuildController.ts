import { useEffect, useMemo, useState } from 'react';
import { randomUUID } from 'node:crypto';
import { useAppStore } from '../../store/useAppStore.js';
import { useBuild } from '../../hooks/useBuild.js';
import { detectHardware } from '../../../infrastructure/system/HardwareDetector.js';
import { recommendedJobs } from '../../../domain/buildOptimizer.js';
import type { BuildProfile } from '../../../domain/models/BuildProfile.js';
import { VERBOSITIES, type BuildTarget } from './types.js';

const HARDWARE = detectHardware();

/**
 * The full build coordination layer:
 * - settings state (config/platform/verbosity/parallel/devshell)
 * - derived configurations from current target
 * - profile + command preview
 * - runBuild + runQuickCheck actions
 * - elapsed-time tracker during execution
 *
 * UI components consume this via destructure and never reach into the store directly
 * for build-related state, so the store can change without rewiring components.
 */
export function useBuildController(currentTarget: BuildTarget | undefined) {
  const { status, result, start, cancel, resolveCommand } = useBuild();

  // Persistent (store-backed) settings
  const configIdx = useAppStore((s) => s.buildConfigIdx);
  const setConfigIdx = useAppStore((s) => s.setBuildConfigIdx);
  const platformIdx = useAppStore((s) => s.buildPlatformIdx);
  const setPlatformIdx = useAppStore((s) => s.setBuildPlatformIdx);
  const verbosityIdx = useAppStore((s) => s.buildVerbosityIdx);
  const setVerbosityIdx = useAppStore((s) => s.setBuildVerbosityIdx);
  const parallelBuild = useAppStore((s) => s.buildParallel);
  const setParallelBuild = useAppStore((s) => s.setBuildParallel);
  const useDevShell = useAppStore((s) => s.buildDevShell);
  const setUseDevShell = useAppStore((s) => s.setBuildDevShell);
  const buildStartTime = useAppStore((s) => s.buildStartTime);
  const setLastBuiltTargetPath = useAppStore((s) => s.setLastBuiltTargetPath);
  const setLastBuildProfileSnapshot = useAppStore((s) => s.setLastBuildProfileSnapshot);
  const configByTarget = useAppStore((s) => s.configByTarget);
  const setConfigForTarget = useAppStore((s) => s.setConfigForTarget);

  const [elapsedMs, setElapsedMs] = useState(0);

  // Configurations available for the current target
  const availableConfigs = useMemo(() => {
    if (!currentTarget) return [{ configuration: 'Debug', platform: 'Any CPU' }];

    if (currentTarget.solution) {
      return currentTarget.solution.configurations.length > 0
        ? currentTarget.solution.configurations
        : [
            { configuration: 'Debug', platform: 'Any CPU' },
            { configuration: 'Release', platform: 'Any CPU' },
          ];
    }
    if (currentTarget.project) {
      return currentTarget.project.configurations.length > 0
        ? currentTarget.project.configurations
        : [
            { configuration: 'Debug', platform: 'Any CPU' },
            { configuration: 'Release', platform: 'Any CPU' },
          ];
    }
    return [{ configuration: 'Debug', platform: 'Any CPU' }];
  }, [currentTarget]);

  const uniqueConfigs = useMemo(() => [...new Set(availableConfigs.map((c) => c.configuration))], [availableConfigs]);
  const uniquePlatforms = useMemo(() => [...new Set(availableConfigs.map((c) => c.platform))], [availableConfigs]);

  // When the target changes, restore the user's last-used config + platform
  // for that target (if remembered), otherwise default to index 0.
  useEffect(() => {
    if (!currentTarget) return;
    const remembered = configByTarget[currentTarget.path];
    if (remembered) {
      const cIdx = uniqueConfigs.indexOf(remembered.configuration);
      const pIdx = uniquePlatforms.indexOf(remembered.platform);
      setConfigIdx(cIdx >= 0 ? cIdx : 0);
      setPlatformIdx(pIdx >= 0 ? pIdx : 0);
    } else {
      setConfigIdx(0);
      setPlatformIdx(0);
    }
    // Intentionally exclude configByTarget so changing it doesn't re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTarget?.path, uniqueConfigs, uniquePlatforms, setConfigIdx, setPlatformIdx]);

  // Clamp config/platform indices when the option count shrinks
  useEffect(() => {
    if (configIdx >= uniqueConfigs.length) {
      setConfigIdx(Math.max(0, uniqueConfigs.length - 1));
    }
  }, [configIdx, uniqueConfigs.length, setConfigIdx]);

  useEffect(() => {
    if (platformIdx >= uniquePlatforms.length) {
      setPlatformIdx(Math.max(0, uniquePlatforms.length - 1));
    }
  }, [platformIdx, uniquePlatforms.length, setPlatformIdx]);

  const profile: BuildProfile | null = useMemo(() => {
    if (!currentTarget) return null;
    return {
      id: randomUUID(),
      name: 'Quick Build',
      targetPath: currentTarget.path,
      buildSystem: currentTarget.buildSystem,
      configuration: uniqueConfigs[configIdx] ?? 'Debug',
      platform: uniquePlatforms[platformIdx] ?? 'Any CPU',
      extraArguments: [],
      useDeveloperShell: useDevShell,
      enableBinaryLog: false,
      parallel: parallelBuild,
      verbosity: VERBOSITIES[verbosityIdx]!,
    };
  }, [currentTarget, configIdx, platformIdx, verbosityIdx, parallelBuild, useDevShell, uniqueConfigs, uniquePlatforms]);

  const commandPreview = useMemo(() => {
    if (!profile || !currentTarget) return '';
    const proj = currentTarget.project ?? currentTarget.solution?.projects[0];
    if (!proj) return '';
    return resolveCommand(proj, profile)?.displayString ?? '';
  }, [profile, currentTarget, resolveCommand]);

  const autoJobs = currentTarget
    ? recommendedJobs({
        buildSystem: currentTarget.buildSystem,
        projectType: currentTarget.project?.projectType,
        hardware: HARDWARE,
      })
    : HARDWARE.cpuCores;

  const recordLastBuilt = (p: BuildProfile) => {
    setLastBuiltTargetPath(p.targetPath);
    setLastBuildProfileSnapshot({
      targetPath: p.targetPath,
      config: p.configuration,
      platform: p.platform,
    });
    setConfigForTarget(p.targetPath, p.configuration, p.platform);
  };

  const runBuild = () => {
    if (!currentTarget || !profile) return;
    const proj = currentTarget.project ?? currentTarget.solution?.projects[0];
    if (proj) {
      setElapsedMs(0);
      recordLastBuilt(profile);
      start(proj, profile);
    }
  };

  const runQuickCheck = () => {
    if (!currentTarget || !profile) return;
    const proj = currentTarget.project ?? currentTarget.solution?.projects[0];
    if (!proj) return;

    const analyzerArgs =
      currentTarget.buildSystem === 'dotnet'
        ? ['--no-restore', '/p:RunAnalyzers=true', '/p:RunAnalyzersDuringBuild=true']
        : currentTarget.buildSystem === 'msbuild'
          ? ['/p:RunAnalyzers=true', '/p:RunAnalyzersDuringBuild=true']
          : [];

    const checkProfile: BuildProfile = {
      ...profile,
      id: randomUUID(),
      name: 'Quick Check',
      verbosity: 'minimal',
      extraArguments: [...new Set([...profile.extraArguments, ...analyzerArgs])],
    };

    setElapsedMs(0);
    recordLastBuilt(checkProfile);
    start(proj, checkProfile);
  };

  // Elapsed-time ticker during build
  useEffect(() => {
    if (status !== 'running' || !buildStartTime) return;
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - buildStartTime);
    }, 1000);
    return () => clearInterval(timer);
  }, [status, buildStartTime]);

  return {
    status,
    result,
    cancel,
    profile,
    commandPreview,
    elapsedMs,
    uniqueConfigs,
    uniquePlatforms,
    configIdx,
    setConfigIdx,
    platformIdx,
    setPlatformIdx,
    verbosityIdx,
    setVerbosityIdx,
    parallelBuild,
    setParallelBuild,
    useDevShell,
    setUseDevShell,
    autoJobs,
    hardware: HARDWARE,
    runBuild,
    runQuickCheck,
  };
}
