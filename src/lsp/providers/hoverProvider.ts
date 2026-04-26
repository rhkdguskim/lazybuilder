/**
 * Hover provider for csproj-family and global.json files.
 *
 * Resolves the token under the cursor and returns the matching environment
 * detail from EnvironmentSnapshot (installed SDKs, MSVC toolsets, etc.).
 */
import type { Hover, Position } from 'vscode-languageserver/node.js';
import { parseCsproj, positionInRange } from '../parsers/csproj.js';
import { parseGlobalJson } from '../parsers/globalJson.js';
import { classifyDocument, type WorkspaceContext } from '../workspace.js';

function md(lines: string[]): Hover {
  return {
    contents: {
      kind: 'markdown',
      value: lines.join('\n'),
    },
  };
}

/** Match any installed dotnet SDK whose major.minor (or exact) matches a TFM. */
function matchTfmToSdks(tfm: string, sdks: { version: string; installedPath: string }[]) {
  // Normalize: net8.0 / net6.0 / netcoreapp3.1 → "8.0", "6.0", "3.1"
  const m = /(?:^net|netcoreapp)?(\d+)\.(\d+)/i.exec(tfm.trim());
  if (!m) return [];
  const [, major, minor] = m;
  const prefix = `${major}.${minor}`;
  return sdks.filter((s) => s.version.startsWith(prefix));
}

function hoverForTargetFramework(tfm: string, ctx: WorkspaceContext): Hover {
  const sdks = ctx.snapshot.dotnet?.sdks ?? [];
  const matches = matchTfmToSdks(tfm, sdks);
  const lines = [`**Target Framework:** \`${tfm}\``, ''];
  if (matches.length > 0) {
    lines.push('Installed SDKs matching this TFM:');
    for (const sdk of matches) {
      lines.push(`- \`${sdk.version}\` — ${sdk.installedPath}`);
    }
  } else {
    lines.push('No installed .NET SDK matches this TFM.');
    if (sdks.length > 0) {
      lines.push('');
      lines.push('Installed SDKs:');
      for (const sdk of sdks.slice(0, 8)) lines.push(`- \`${sdk.version}\``);
    }
  }
  const workloads = ctx.snapshot.dotnet?.workloads ?? [];
  if (workloads.length > 0) {
    lines.push('', `Workloads: ${workloads.join(', ')}`);
  }
  return md(lines);
}

function hoverForPlatformToolset(toolset: string, ctx: WorkspaceContext): Hover {
  const toolsets = ctx.snapshot.cpp?.toolsets ?? [];
  // Toolset versions like "v143" generally map to MSVC 14.3x.
  const match = toolsets.find((t) => t.version.toLowerCase().includes(toolset.toLowerCase()))
    ?? toolsets[0];
  const lines = [`**Platform Toolset:** \`${toolset}\``, ''];
  if (match) {
    lines.push(`Installed: \`${match.version}\` at ${match.installedPath}`);
  } else {
    lines.push('No matching MSVC toolset detected on this machine.');
  }
  if (toolsets.length > 0) {
    lines.push('', 'Detected MSVC toolsets:');
    for (const t of toolsets.slice(0, 8)) lines.push(`- \`${t.version}\``);
  }
  return md(lines);
}

function hoverForGlobalJsonVersion(version: string, ctx: WorkspaceContext): Hover {
  const sdks = ctx.snapshot.dotnet?.sdks ?? [];
  const exact = sdks.find((s) => s.version === version);
  const lines = [`**Pinned SDK version:** \`${version}\``, ''];
  if (exact) {
    lines.push(`Installed at \`${exact.installedPath}\``);
  } else {
    lines.push('Not installed on this machine.');
  }
  if (sdks.length > 0) {
    lines.push('', 'Installed SDKs:');
    for (const sdk of sdks.slice(0, 12)) lines.push(`- \`${sdk.version}\``);
  }
  return md(lines);
}

export async function computeHover(
  uri: string,
  text: string,
  position: Position,
  ctx: WorkspaceContext,
): Promise<Hover | null> {
  const kind = classifyDocument(uri);
  if (kind === 'unsupported') return null;

  if (kind === 'csproj') {
    const tokens = parseCsproj(text);
    if (tokens.targetFramework && positionInRange(position, tokens.targetFramework.range)) {
      return hoverForTargetFramework(tokens.targetFramework.value, ctx);
    }
    if (tokens.targetFrameworks && positionInRange(position, tokens.targetFrameworks.range)) {
      // Multi-TFM: hover shows the first one for now.
      const first = tokens.targetFrameworks.value.split(';').map((s) => s.trim()).filter(Boolean)[0];
      if (first) return hoverForTargetFramework(first, ctx);
    }
    for (const ts of tokens.platformToolsets) {
      if (positionInRange(position, ts.range)) {
        return hoverForPlatformToolset(ts.value, ctx);
      }
    }
    return null;
  }

  if (kind === 'globalJson') {
    const tokens = parseGlobalJson(text);
    if (tokens.version && positionInRange(position, tokens.version.range)) {
      return hoverForGlobalJsonVersion(tokens.version.value, ctx);
    }
    return null;
  }

  return null;
}
