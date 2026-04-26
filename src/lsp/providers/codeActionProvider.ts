/**
 * Code action provider — turns DIAG002 / DIAG003 diagnostics into
 * "Install <SDK>" quick-fixes that invoke the `lazybuilder.toolchain.apply`
 * executeCommand. The action carries the precise step IDs so the command
 * handler does not have to re-derive them from the diagnostic text.
 *
 * See `docs/features/lsp-codeaction.md` for the UX flow.
 */
import {
  CodeActionKind,
  type CodeAction,
  type Diagnostic,
  type Range,
} from 'vscode-languageserver/node.js';
import { resolveToolchainRequirements } from '../../domain/rules/toolchainRules.js';
import type { ToolchainRequirement } from '../../domain/models/ToolchainRequirement.js';
import { classifyDocument, type WorkspaceContext } from '../workspace.js';

const APPLY_COMMAND = 'lazybuilder.toolchain.apply';
const SDK_SIZE_HINT_MB = 280;

/**
 * Argument shape passed via CodeAction.command.arguments[0] and consumed by
 * the executeCommand handler.
 */
export interface ToolchainApplyArgs {
  stepIds: string[];
  scope: 'user' | 'machine';
  sourceUri?: string;
}

/**
 * Compute LSP code actions for the diagnostics in `ctx`.
 *
 * - URI is filtered through `classifyDocument`; unsupported docs return [].
 * - Only DIAG002 (global.json mismatch) and DIAG003 (no SDK for TFM)
 *   diagnostics generate quick-fixes today.
 * - When `requestedKinds` is non-empty and does not include QuickFix, returns []
 *   (lets clients narrow code actions by kind per the LSP spec).
 */
export function computeCodeActions(
  uri: string,
  _text: string,
  _range: Range,
  ctx: WorkspaceContext & { diagnostics: Diagnostic[] },
  requestedKinds: string[] = [],
): CodeAction[] {
  if (classifyDocument(uri) === 'unsupported') return [];

  // Honor client kind filters. An empty/undefined filter means "all kinds".
  if (requestedKinds.length > 0) {
    const wantsQuickFix = requestedKinds.some(
      (k) => k === CodeActionKind.QuickFix || CodeActionKind.QuickFix.startsWith(k),
    );
    if (!wantsQuickFix) return [];
  }

  const requirements = resolveToolchainRequirements(ctx.snapshot, ctx.projects);
  const actions: CodeAction[] = [];

  for (const diagnostic of ctx.diagnostics) {
    const code = typeof diagnostic.code === 'string' ? diagnostic.code : null;
    if (code !== 'DIAG002' && code !== 'DIAG003') continue;

    const built = code === 'DIAG003'
      ? buildDiag003Action(uri, diagnostic, requirements)
      : buildDiag002Action(uri, diagnostic, ctx, requirements);
    if (built) actions.push(built);
  }

  return actions;
}

function buildDiag003Action(
  uri: string,
  diagnostic: Diagnostic,
  requirements: ToolchainRequirement[],
): CodeAction | null {
  // DIAG003 title is "No SDK for net8.0" — extract the major.minor TFM token.
  const tfm = extractTfmFromMessage(diagnostic.message);
  if (!tfm) return null;
  const major = tfm.major;

  // Match requirements by versionSpec prefix (e.g. "8.0.x" starts with "8.").
  const matching = requirements.filter(
    (r) => r.kind === 'dotnet-sdk' && r.versionSpec.startsWith(`${major}.`),
  );
  if (matching.length === 0) return null;

  const stepIds = matching.map((r) => r.id);
  return {
    title: `Install .NET ${major} SDK (no admin, ~${SDK_SIZE_HINT_MB} MB)`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    command: {
      title: 'Install via LazyBuilder',
      command: APPLY_COMMAND,
      arguments: [
        {
          stepIds,
          scope: 'user',
          sourceUri: uri,
        } satisfies ToolchainApplyArgs,
      ],
    },
  };
}

function buildDiag002Action(
  uri: string,
  diagnostic: Diagnostic,
  ctx: WorkspaceContext,
  requirements: ToolchainRequirement[],
): CodeAction | null {
  const version = ctx.snapshot.dotnet?.globalJsonSdkVersion ?? null;
  if (!version) return null;

  const matching = requirements.filter(
    (r) => r.kind === 'dotnet-sdk' && r.versionSpec === version,
  );
  if (matching.length === 0) return null;

  const stepIds = matching.map((r) => r.id);
  return {
    title: `Install .NET ${version} SDK (no admin, ~${SDK_SIZE_HINT_MB} MB)`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    command: {
      title: 'Install via LazyBuilder',
      command: APPLY_COMMAND,
      arguments: [
        {
          stepIds,
          scope: 'user',
          sourceUri: uri,
        } satisfies ToolchainApplyArgs,
      ],
    },
  };
}

/**
 * Extract a TFM (major.minor) from a DIAG003 diagnostic message.
 *
 * The dotnetRules emitter produces titles like "No SDK for net8.0", so we look
 * for the first `netMAJOR.MINOR[-suffix]` token. We deliberately accept the
 * suffix so MAUI-style TFMs (`net8.0-android`) still parse.
 */
function extractTfmFromMessage(message: string): { tfm: string; major: string; minor: string } | null {
  const match = message.match(/net(\d+)\.(\d+)(?:-[a-z0-9.]+)?/i);
  if (!match) return null;
  return {
    tfm: match[0],
    major: match[1]!,
    minor: match[2]!,
  };
}
