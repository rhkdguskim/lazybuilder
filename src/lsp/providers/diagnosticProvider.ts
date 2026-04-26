/**
 * Maps LazyBuilder DiagnosticItem[] (from DiagnosticsService) to LSP Diagnostic[]
 * for a single document.
 *
 * The mapping rules:
 * - Filter to items whose `relatedPaths` include this file path, OR (for
 *   global.json) items whose category is 'dotnet' so the user can see SDK
 *   issues right where the version is pinned.
 * - Map severity: error → 1 (Error), warning → 2 (Warning), unknown → 3
 *   (Information). 'ok' items are dropped (LSP shouldn't show success markers).
 * - For range, try to map known categories to a parsed token range; fall back
 *   to (0,0)-(0,1).
 */
import {
  DiagnosticSeverity,
  type Diagnostic,
} from 'vscode-languageserver/node.js';
import { DiagnosticsService } from '../../application/DiagnosticsService.js';
import type { DiagnosticItem } from '../../domain/models/DiagnosticItem.js';
import { parseCsproj } from '../parsers/csproj.js';
import { parseGlobalJson } from '../parsers/globalJson.js';
import { classifyDocument, uriToFsPath, type WorkspaceContext } from '../workspace.js';

const FALLBACK_RANGE = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 1 },
};

function mapSeverity(sev: DiagnosticItem['severity']): DiagnosticSeverity | null {
  switch (sev) {
    case 'error':
      return DiagnosticSeverity.Error;
    case 'warning':
      return DiagnosticSeverity.Warning;
    case 'unknown':
      return DiagnosticSeverity.Information;
    case 'ok':
      return null;
    default:
      return DiagnosticSeverity.Information;
  }
}

function buildMessage(item: DiagnosticItem): string {
  const parts = [item.title, item.description];
  if (item.suggestedAction) parts.push(`Suggested: ${item.suggestedAction}`);
  return parts.filter(Boolean).join('\n');
}

function pickRangeForCsproj(item: DiagnosticItem, text: string) {
  const tokens = parseCsproj(text);
  // dotnet rules → TFM range
  if (item.category === 'dotnet') {
    if (tokens.targetFramework) return tokens.targetFramework.range;
    if (tokens.targetFrameworks) return tokens.targetFrameworks.range;
  }
  // cpp/msbuild rules → PlatformToolset range (first occurrence)
  if (item.category === 'cpp' || item.category === 'msbuild') {
    if (tokens.platformToolsets[0]) return tokens.platformToolsets[0].range;
  }
  return FALLBACK_RANGE;
}

function pickRangeForGlobalJson(text: string) {
  const tokens = parseGlobalJson(text);
  if (tokens.version) return tokens.version.range;
  return FALLBACK_RANGE;
}

export async function computeDiagnostics(
  uri: string,
  text: string,
  ctx: WorkspaceContext,
): Promise<Diagnostic[]> {
  const kind = classifyDocument(uri);
  if (kind === 'unsupported') return [];

  const fsPath = uriToFsPath(uri);
  const items = new DiagnosticsService().analyze(ctx.snapshot, ctx.projects);

  const relevant = items.filter((it) => {
    if (it.severity === 'ok') return false;
    if (it.relatedPaths && it.relatedPaths.includes(fsPath)) return true;
    if (kind === 'globalJson' && it.category === 'dotnet') {
      // SDK-related rules without an explicit related path also surface here.
      return true;
    }
    return false;
  });

  const diagnostics: Diagnostic[] = [];
  for (const item of relevant) {
    const severity = mapSeverity(item.severity);
    if (severity === null) continue;

    const range =
      kind === 'csproj'
        ? pickRangeForCsproj(item, text)
        : pickRangeForGlobalJson(text);

    diagnostics.push({
      range,
      severity,
      code: item.code,
      source: 'lazybuilder',
      message: buildMessage(item),
    });
  }

  return diagnostics;
}
