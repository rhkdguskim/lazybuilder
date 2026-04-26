import React from 'react';
import { Panel } from '../../components/index.js';
import { FieldRow } from './FieldRow.js';
import { VERBOSITIES, type SettingField } from './types.js';
import type { HardwareInfo } from '../../../domain/models/HardwareInfo.js';

interface Props {
  activeSetting: SettingField;
  uniqueConfigs: string[];
  configIdx: number;
  uniquePlatforms: string[];
  platformIdx: number;
  verbosityIdx: number;
  parallelBuild: boolean;
  useDevShell: boolean;
  autoJobs: number;
  hardware: HardwareInfo;
}

export const BuildSettingsPanel: React.FC<Props> = ({
  activeSetting,
  uniqueConfigs,
  configIdx,
  uniquePlatforms,
  platformIdx,
  verbosityIdx,
  parallelBuild,
  useDevShell,
  autoJobs,
  hardware,
}) => {
  return (
    <Panel title="Settings" focused subtitle="h/l changes values" marginTop={1} flexShrink={0}>
      <FieldRow
        label="Config"
        value={uniqueConfigs[configIdx] ?? 'Debug'}
        active={activeSetting === 'configuration'}
        options={uniqueConfigs}
        selectedIdx={configIdx}
      />
      <FieldRow
        label="Platform"
        value={uniquePlatforms[platformIdx] ?? 'Any CPU'}
        active={activeSetting === 'platform'}
        options={uniquePlatforms}
        selectedIdx={platformIdx}
      />
      <FieldRow
        label="Verbose"
        value={VERBOSITIES[verbosityIdx]!}
        active={activeSetting === 'verbosity'}
        options={[...VERBOSITIES]}
        selectedIdx={verbosityIdx}
      />
      <FieldRow
        label="Parallel"
        value={parallelBuild ? `AUTO x${autoJobs}` : 'OFF'}
        active={activeSetting === 'parallel'}
        hint={parallelBuild ? `${hardware.cpuCores} cores, ${hardware.totalMemoryGB}GB RAM` : 'single process'}
      />
      <FieldRow
        label="DevShell"
        value={useDevShell ? 'ON' : 'OFF'}
        active={activeSetting === 'devshell'}
        hint={useDevShell ? 'VsDevCmd enabled' : 'direct execution'}
      />
    </Panel>
  );
};
