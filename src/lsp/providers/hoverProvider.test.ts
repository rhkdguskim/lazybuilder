import { describe, it, expect } from 'vitest';
import { computeHover } from './hoverProvider.js';
import { parseCsproj } from '../parsers/csproj.js';
import { parseGlobalJson } from '../parsers/globalJson.js';
import {
  makeSnapshot,
  snapshotWithSdks,
} from '../../__fixtures__/snapshots.js';
import {
  SAMPLE_CSPROJ_NET8,
  SAMPLE_VCXPROJ,
  SAMPLE_GLOBAL_JSON,
} from '../../__fixtures__/projects.js';
import type { WorkspaceContext } from '../workspace.js';

function ctxFor(
  snapshot = makeSnapshot(),
  projects: WorkspaceContext['projects'] = [],
): WorkspaceContext {
  return {
    rootPath: '/proj',
    snapshot,
    projects,
    solutions: [],
  };
}

function midpointOf(range: { start: { line: number; character: number }; end: { line: number; character: number } }) {
  // For single-line ranges (which the parsers always emit), pick the midpoint.
  if (range.start.line === range.end.line) {
    return {
      line: range.start.line,
      character: Math.floor(
        (range.start.character + range.end.character) / 2,
      ),
    };
  }
  return range.start;
}

describe('computeHover', () => {
  it('returns null for unsupported document URIs', async () => {
    const result = await computeHover(
      'file:///proj/readme.md',
      'hello',
      { line: 0, character: 0 },
      ctxFor(),
    );
    expect(result).toBeNull();
  });

  it('returns hover for cursor inside <TargetFramework> when SDK is installed', async () => {
    const snapshot = snapshotWithSdks(['8.0.405']);
    const tokens = parseCsproj(SAMPLE_CSPROJ_NET8);
    const pos = midpointOf(tokens.targetFramework!.range);
    const hover = await computeHover(
      'file:///proj/App.csproj',
      SAMPLE_CSPROJ_NET8,
      pos,
      ctxFor(snapshot),
    );
    expect(hover).not.toBeNull();
    const contents = hover!.contents as { kind: string; value: string };
    expect(contents.kind).toBe('markdown');
    expect(contents.value).toContain('Target Framework');
    expect(contents.value).toContain('net8.0');
    expect(contents.value).toContain('8.0.405');
  });

  it('returns hover indicating "no installed SDK matches" when none installed', async () => {
    const snapshot = snapshotWithSdks([]);
    const tokens = parseCsproj(SAMPLE_CSPROJ_NET8);
    const pos = midpointOf(tokens.targetFramework!.range);
    const hover = await computeHover(
      'file:///proj/App.csproj',
      SAMPLE_CSPROJ_NET8,
      pos,
      ctxFor(snapshot),
    );
    expect(hover).not.toBeNull();
    const contents = hover!.contents as { kind: string; value: string };
    expect(contents.value).toContain('No installed .NET SDK matches');
  });

  it('returns hover for cursor inside <PlatformToolset> with toolset info', async () => {
    const snapshot = makeSnapshot();
    snapshot.cpp.toolsets = [
      {
        sdkType: 'msvc-toolset',
        version: 'v143',
        installedPath: 'C:/VS/MSVC',
        isSelected: false,
        isRequired: false,
        status: 'ok',
      },
    ];
    const tokens = parseCsproj(SAMPLE_VCXPROJ);
    const pos = midpointOf(tokens.platformToolsets[0]!.range);
    const hover = await computeHover(
      'file:///proj/App.vcxproj',
      SAMPLE_VCXPROJ,
      pos,
      ctxFor(snapshot),
    );
    expect(hover).not.toBeNull();
    const contents = hover!.contents as { kind: string; value: string };
    expect(contents.value).toContain('Platform Toolset');
    expect(contents.value).toContain('v143');
    expect(contents.value).toContain('C:/VS/MSVC');
  });

  it('returns hover indicating "No matching MSVC toolset" when toolsets are empty', async () => {
    const snapshot = makeSnapshot();
    snapshot.cpp.toolsets = [];
    const tokens = parseCsproj(SAMPLE_VCXPROJ);
    const pos = midpointOf(tokens.platformToolsets[0]!.range);
    const hover = await computeHover(
      'file:///proj/App.vcxproj',
      SAMPLE_VCXPROJ,
      pos,
      ctxFor(snapshot),
    );
    expect(hover).not.toBeNull();
    const contents = hover!.contents as { kind: string; value: string };
    expect(contents.value).toContain('No matching MSVC toolset');
  });

  it('returns null when cursor is on whitespace outside any tracked token', async () => {
    // line 0 = `<Project Sdk="Microsoft.NET.Sdk">` — outside any tracked token.
    const hover = await computeHover(
      'file:///proj/App.csproj',
      SAMPLE_CSPROJ_NET8,
      { line: 0, character: 0 },
      ctxFor(snapshotWithSdks(['8.0.405'])),
    );
    expect(hover).toBeNull();
  });

  it('returns hover for global.json version cursor when SDK is installed', async () => {
    const snapshot = snapshotWithSdks(['8.0.405']);
    const tokens = parseGlobalJson(SAMPLE_GLOBAL_JSON);
    const pos = midpointOf(tokens.version!.range);
    const hover = await computeHover(
      'file:///proj/global.json',
      SAMPLE_GLOBAL_JSON,
      pos,
      ctxFor(snapshot),
    );
    expect(hover).not.toBeNull();
    const contents = hover!.contents as { kind: string; value: string };
    expect(contents.value).toContain('Pinned SDK version');
    expect(contents.value).toContain('8.0.405');
    expect(contents.value).toContain('Installed');
  });

  it('returns hover indicating "Not installed" when global.json points to missing SDK', async () => {
    const snapshot = snapshotWithSdks(['7.0.100']); // doesn't match 8.0.405
    const tokens = parseGlobalJson(SAMPLE_GLOBAL_JSON);
    const pos = midpointOf(tokens.version!.range);
    const hover = await computeHover(
      'file:///proj/global.json',
      SAMPLE_GLOBAL_JSON,
      pos,
      ctxFor(snapshot),
    );
    expect(hover).not.toBeNull();
    const contents = hover!.contents as { kind: string; value: string };
    expect(contents.value).toContain('Not installed on this machine');
  });

  it('returns null for global.json when cursor is outside the version value', async () => {
    const hover = await computeHover(
      'file:///proj/global.json',
      SAMPLE_GLOBAL_JSON,
      { line: 0, character: 0 }, // line 0 is `{`
      ctxFor(snapshotWithSdks(['8.0.405'])),
    );
    expect(hover).toBeNull();
  });

  it('falls back to hovering the first TFM when only TargetFrameworks (plural) is present', async () => {
    const snapshot = snapshotWithSdks(['6.0.428', '8.0.405']);
    const text = `<Project>
  <PropertyGroup>
    <TargetFrameworks>net6.0;net8.0</TargetFrameworks>
  </PropertyGroup>
</Project>`;
    const tokens = parseCsproj(text);
    const pos = midpointOf(tokens.targetFrameworks!.range);
    const hover = await computeHover(
      'file:///proj/Multi.csproj',
      text,
      pos,
      ctxFor(snapshot),
    );
    expect(hover).not.toBeNull();
    const contents = hover!.contents as { kind: string; value: string };
    expect(contents.value).toContain('net6.0');
  });
});

