/**
 * Position-aware (line/character) parser for csproj/fsproj/vbproj XML.
 *
 * fast-xml-parser is fast but does not preserve source positions, so we use
 * regex over the raw text to find token ranges. The matches are good enough
 * for LSP diagnostics and hover, where we only need ranges that point at the
 * inner text of well-known build properties.
 */
import type { Range } from 'vscode-languageserver/node.js';

export interface TokenRange {
  /** Inner text of the matched element (e.g. "net8.0"). */
  value: string;
  /** LSP range covering the inner text only. */
  range: Range;
}

/**
 * Convert a 0-based character offset in `text` into an LSP Position
 * (0-based line, 0-based character within the line).
 */
export function offsetToPosition(text: string, offset: number): { line: number; character: number } {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: Math.max(0, offset - lineStart) };
}

function rangeFor(text: string, start: number, end: number): Range {
  return {
    start: offsetToPosition(text, start),
    end: offsetToPosition(text, end),
  };
}

function findFirstElement(text: string, tag: string): TokenRange | null {
  const re = new RegExp(`<${tag}\\s*>([^<]*)</${tag}>`);
  const m = re.exec(text);
  if (!m) return null;
  const openTag = `<${tag}>`;
  const innerStart = m.index + openTag.length;
  const innerEnd = innerStart + m[1]!.length;
  return { value: m[1]!.trim(), range: rangeFor(text, innerStart, innerEnd) };
}

function findAllElements(text: string, tag: string): TokenRange[] {
  const out: TokenRange[] = [];
  const re = new RegExp(`<${tag}\\s*>([^<]*)</${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const openTag = `<${tag}>`;
    const innerStart = m.index + openTag.length;
    const innerEnd = innerStart + m[1]!.length;
    out.push({ value: m[1]!.trim(), range: rangeFor(text, innerStart, innerEnd) });
  }
  return out;
}

export interface CsprojTokens {
  /** First <TargetFramework>…</TargetFramework>, if present. */
  targetFramework: TokenRange | null;
  /** <TargetFrameworks>…</TargetFrameworks>, if present (semicolon-separated). */
  targetFrameworks: TokenRange | null;
  /** All <PlatformToolset>…</PlatformToolset> nodes (vcxproj). */
  platformToolsets: TokenRange[];
  /** All <WindowsTargetPlatformVersion>…</…> nodes. */
  windowsTargetPlatformVersions: TokenRange[];
}

export function parseCsproj(text: string): CsprojTokens {
  return {
    targetFramework: findFirstElement(text, 'TargetFramework'),
    targetFrameworks: findFirstElement(text, 'TargetFrameworks'),
    platformToolsets: findAllElements(text, 'PlatformToolset'),
    windowsTargetPlatformVersions: findAllElements(text, 'WindowsTargetPlatformVersion'),
  };
}

/**
 * 0-based offset for a Position in `text`. Used to test "is the cursor inside
 * this token?".
 */
export function positionToOffset(text: string, position: { line: number; character: number }): number {
  let line = 0;
  let i = 0;
  while (i < text.length && line < position.line) {
    if (text.charCodeAt(i) === 10 /* \n */) line++;
    i++;
  }
  return Math.min(text.length, i + position.character);
}

/** Returns true if `pos` is within `range` (inclusive on start, inclusive on end). */
export function positionInRange(pos: { line: number; character: number }, range: Range): boolean {
  if (pos.line < range.start.line || pos.line > range.end.line) return false;
  if (pos.line === range.start.line && pos.character < range.start.character) return false;
  if (pos.line === range.end.line && pos.character > range.end.character) return false;
  return true;
}
