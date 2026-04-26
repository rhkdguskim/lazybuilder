/**
 * Position-aware parser for global.json. We only care about the value range of
 * `"version": "..."` (and optionally `rollForward`).
 */
import type { Range } from 'vscode-languageserver/node.js';
import { offsetToPosition, type TokenRange } from './csproj.js';

function findStringField(text: string, fieldName: string): TokenRange | null {
  // Match "field" : "value" — captures the value contents only.
  const re = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]*)"`);
  const m = re.exec(text);
  if (!m) return null;
  // Locate inner-string range: position of the opening quote of the value, +1.
  const valueOpenQuote = text.indexOf('"', m.index + m[0]!.indexOf(':'));
  if (valueOpenQuote < 0) return null;
  const innerStart = valueOpenQuote + 1;
  const innerEnd = innerStart + m[1]!.length;
  const range: Range = {
    start: offsetToPosition(text, innerStart),
    end: offsetToPosition(text, innerEnd),
  };
  return { value: m[1]!, range };
}

export interface GlobalJsonTokens {
  /** Value range for `sdk.version` (or top-level `version`). */
  version: TokenRange | null;
  /** Value range for `sdk.rollForward`, if present. */
  rollForward: TokenRange | null;
}

export function parseGlobalJson(text: string): GlobalJsonTokens {
  return {
    version: findStringField(text, 'version'),
    rollForward: findStringField(text, 'rollForward'),
  };
}
