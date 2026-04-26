import { describe, it, expect } from 'vitest';
import { ToolchainService } from './ToolchainService.js';
import {
  makeSnapshot,
  snapshotWithSdks,
  snapshotWithGlobalJson,
} from '../__fixtures__/snapshots.js';
import { makeCsproj } from '../__fixtures__/projects.js';
import type { InstallStep } from '../domain/models/InstallPlan.js';

function findStep(steps: InstallStep[], kind: InstallStep['kind']): InstallStep | undefined {
  return steps.find(s => s.kind === kind);
}

describe('ToolchainService.plan()', () => {
  it('returns empty steps when required SDK is already installed', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithSdks(['8.0.405']);
    const projects = [makeCsproj({ name: 'AppA', targetFrameworks: ['net8.0'] })];

    const plan = service.plan(snapshot, projects);

    expect(plan.steps).toEqual([]);
    expect(plan.totalSizeBytes).toBe(0);
    expect(plan.estimatedSeconds).toBe(0);
    expect(plan.needsAdmin).toBe(false);
  });

  it('returns empty steps when there are no .NET projects and no global.json', () => {
    const service = new ToolchainService();
    const snapshot = makeSnapshot();
    const plan = service.plan(snapshot, []);
    expect(plan.steps).toEqual([]);
    expect(plan.totalSizeBytes).toBe(0);
  });

  it('produces a single step for a missing SDK with default user scope', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithSdks([]); // no SDKs installed
    const projects = [makeCsproj({ name: 'AppA', targetFrameworks: ['net8.0'] })];

    const plan = service.plan(snapshot, projects);

    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0]!;
    expect(step.kind).toBe('dotnet-sdk');
    expect(step.scope).toBe('user');
    expect(step.needsAdmin).toBe(false);
    expect(step.selected).toBe(true);
    expect(plan.needsAdmin).toBe(false);
    expect(plan.totalSizeBytes).toBeGreaterThan(0);
  });

  it("respects scope: 'machine' option (needsAdmin true)", () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithSdks([]);
    const projects = [makeCsproj({ name: 'AppA', targetFrameworks: ['net8.0'] })];

    const plan = service.plan(snapshot, projects, { scope: 'machine' });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.scope).toBe('machine');
    expect(plan.steps[0]!.needsAdmin).toBe(true);
    expect(plan.needsAdmin).toBe(true);
  });

  it('emits one step per missing SDK with summed totalSizeBytes', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithSdks([]); // nothing installed
    const projects = [
      makeCsproj({ name: 'AppA', targetFrameworks: ['net6.0'] }),
      makeCsproj({ name: 'AppB', filePath: '/proj/B.csproj', targetFrameworks: ['net8.0'] }),
    ];

    const plan = service.plan(snapshot, projects);

    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    const sumOfSizes = plan.steps.reduce((acc, s) => acc + (s.sizeBytes ?? 0), 0);
    expect(plan.totalSizeBytes).toBe(sumOfSizes);
    for (const step of plan.steps) {
      expect(step.sizeBytes).toBeGreaterThan(0);
    }
  });

  it('produces a workload step with dotnet workload install command', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithSdks(['8.0.405']); // SDK installed but workload missing
    const projects = [
      makeCsproj({ name: 'MauiApp', targetFrameworks: ['net8.0-android'] }),
    ];

    const plan = service.plan(snapshot, projects);

    const workloadStep = findStep(plan.steps, 'dotnet-workload');
    expect(workloadStep).toBeDefined();
    expect(workloadStep!.kind).toBe('dotnet-workload');
    expect(workloadStep!.command.executable).toBe('dotnet');
    expect(workloadStep!.command.args.slice(0, 2)).toEqual(['workload', 'install']);
    expect(workloadStep!.command.args.length).toBeGreaterThanOrEqual(3);
  });

  it('marks every step as selected:true by default', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithSdks([]);
    const projects = [
      makeCsproj({ name: 'AppA', targetFrameworks: ['net6.0'] }),
      makeCsproj({ name: 'AppB', filePath: '/proj/B.csproj', targetFrameworks: ['net8.0-android'] }),
    ];

    const plan = service.plan(snapshot, projects);

    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps.every(s => s.selected === true)).toBe(true);
  });

  it('defaults updateGlobalJson to false', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithSdks([]);
    const projects = [makeCsproj({ targetFrameworks: ['net8.0'] })];

    const plan = service.plan(snapshot, projects);
    expect(plan.updateGlobalJson).toBe(false);
  });

  it('respects updateGlobalJson option', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithSdks([]);
    const projects = [makeCsproj({ targetFrameworks: ['net8.0'] })];

    const plan = service.plan(snapshot, projects, { updateGlobalJson: true });
    expect(plan.updateGlobalJson).toBe(true);
  });

  it('propagates globalJsonPath from snapshot when option is omitted', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithGlobalJson('8.0.405', ['8.0.405']);
    const projects = [makeCsproj({ targetFrameworks: ['net8.0'] })];

    const plan = service.plan(snapshot, projects);
    expect(plan.globalJsonPath).toBe('/proj/global.json');
  });

  it('lets globalJsonPath option override the snapshot value', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithGlobalJson('8.0.405', ['8.0.405']);
    const projects = [makeCsproj({ targetFrameworks: ['net8.0'] })];

    const plan = service.plan(snapshot, projects, {
      globalJsonPath: '/override/global.json',
    });
    expect(plan.globalJsonPath).toBe('/override/global.json');
  });

  it('returns globalJsonPath:null when snapshot has none and no option provided', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithSdks([]);
    const plan = service.plan(snapshot, [makeCsproj({ targetFrameworks: ['net8.0'] })]);
    expect(plan.globalJsonPath).toBeNull();
  });

  it('uses ".NET SDK <version>" displayName for SDK steps', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithSdks([]);
    const projects = [makeCsproj({ targetFrameworks: ['net8.0'] })];

    const plan = service.plan(snapshot, projects);
    const sdkStep = findStep(plan.steps, 'dotnet-sdk');
    expect(sdkStep).toBeDefined();
    expect(sdkStep!.displayName).toMatch(/^\.NET SDK /);
    expect(sdkStep!.displayName).toContain(sdkStep!.version);
  });

  it('uses "Workload: <id>" displayName for workload steps', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithSdks(['8.0.405']);
    const projects = [
      makeCsproj({ name: 'MauiApp', targetFrameworks: ['net8.0-android'] }),
    ];

    const plan = service.plan(snapshot, projects);
    const workloadStep = findStep(plan.steps, 'dotnet-workload');
    expect(workloadStep).toBeDefined();
    expect(workloadStep!.displayName).toMatch(/^Workload: /);
    expect(workloadStep!.displayName).toContain(workloadStep!.version);
  });

  it('dedupes affectedProjects in the step reason', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithGlobalJson('8.0.405', []); // global.json says 8.0.405, none installed
    const projects = [
      makeCsproj({ name: 'AppA', filePath: '/proj/A.csproj', targetFrameworks: ['net8.0'] }),
      makeCsproj({ name: 'AppB', filePath: '/proj/B.csproj', targetFrameworks: ['net8.0'] }),
    ];

    const plan = service.plan(snapshot, projects);
    const sdkStep = findStep(plan.steps, 'dotnet-sdk');
    expect(sdkStep).toBeDefined();
    const affected = sdkStep!.reason.affectedProjects;
    // No duplicates
    expect(new Set(affected).size).toBe(affected.length);
    // Both projects present
    expect(affected).toContain('AppA');
    expect(affected).toContain('AppB');
  });

  it('includes both SDK and workload steps for a Maui project on empty env', () => {
    const service = new ToolchainService();
    const snapshot = snapshotWithSdks([]);
    const projects = [
      makeCsproj({ name: 'MauiApp', targetFrameworks: ['net8.0-android'] }),
    ];

    const plan = service.plan(snapshot, projects);
    expect(findStep(plan.steps, 'dotnet-sdk')).toBeDefined();
    expect(findStep(plan.steps, 'dotnet-workload')).toBeDefined();
  });
});
