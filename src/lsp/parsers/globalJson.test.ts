import { describe, it, expect } from 'vitest';
import { parseGlobalJson } from './globalJson.js';
import { positionToOffset } from './csproj.js';
import {
  SAMPLE_GLOBAL_JSON,
  SAMPLE_GLOBAL_JSON_PINNED,
} from '../../__fixtures__/projects.js';

describe('parseGlobalJson', () => {
  it('captures sdk.version value and inner-string range for SAMPLE_GLOBAL_JSON', () => {
    const tokens = parseGlobalJson(SAMPLE_GLOBAL_JSON);
    expect(tokens.version?.value).toBe('8.0.405');

    const startOffset = positionToOffset(
      SAMPLE_GLOBAL_JSON,
      tokens.version!.range.start,
    );
    const endOffset = positionToOffset(
      SAMPLE_GLOBAL_JSON,
      tokens.version!.range.end,
    );
    expect(SAMPLE_GLOBAL_JSON.slice(startOffset, endOffset)).toBe('8.0.405');
  });

  it('captures rollForward when present', () => {
    const tokens = parseGlobalJson(SAMPLE_GLOBAL_JSON);
    expect(tokens.rollForward?.value).toBe('latestFeature');
  });

  it('captures version for the pinned sample', () => {
    const tokens = parseGlobalJson(SAMPLE_GLOBAL_JSON_PINNED);
    expect(tokens.version?.value).toBe('6.0.428');
    expect(tokens.rollForward).toBeNull();
  });

  it('range character points to the value, not the key', () => {
    // Inline so we can compute exact char positions on a single line.
    const text = '{"version":"8.0.405"}';
    const tokens = parseGlobalJson(text);
    expect(tokens.version?.value).toBe('8.0.405');
    // `{"version":"` is 12 chars → the value starts at character 12.
    expect(tokens.version?.range.start).toEqual({ line: 0, character: 12 });
    expect(tokens.version?.range.end).toEqual({
      line: 0,
      character: 12 + '8.0.405'.length,
    });
  });

  it('returns null when version field is missing', () => {
    const tokens = parseGlobalJson('{ "sdk": {} }');
    expect(tokens.version).toBeNull();
    expect(tokens.rollForward).toBeNull();
  });

  it('returns null for malformed JSON without throwing', () => {
    expect(() => parseGlobalJson('{ this is not json')).not.toThrow();
    const tokens = parseGlobalJson('{ this is not json');
    expect(tokens.version).toBeNull();
  });

  it('handles compact whitespace ("version":"8.0.405")', () => {
    const text = '{"sdk":{"version":"8.0.405"}}';
    const tokens = parseGlobalJson(text);
    expect(tokens.version?.value).toBe('8.0.405');
    const startOffset = positionToOffset(text, tokens.version!.range.start);
    const endOffset = positionToOffset(text, tokens.version!.range.end);
    expect(text.slice(startOffset, endOffset)).toBe('8.0.405');
  });

  it('handles loose whitespace ("version"  :  "8.0.405")', () => {
    const text = '{ "sdk": { "version"  :  "8.0.405" } }';
    const tokens = parseGlobalJson(text);
    expect(tokens.version?.value).toBe('8.0.405');
    const startOffset = positionToOffset(text, tokens.version!.range.start);
    const endOffset = positionToOffset(text, tokens.version!.range.end);
    expect(text.slice(startOffset, endOffset)).toBe('8.0.405');
  });

  it('returns empty result for empty input without throwing', () => {
    expect(() => parseGlobalJson('')).not.toThrow();
    const tokens = parseGlobalJson('');
    expect(tokens.version).toBeNull();
    expect(tokens.rollForward).toBeNull();
  });

  it('captures version on a multi-line document with correct line index', () => {
    const text = '{\n  "sdk": {\n    "version": "9.0.100"\n  }\n}\n';
    const tokens = parseGlobalJson(text);
    expect(tokens.version?.value).toBe('9.0.100');
    expect(tokens.version?.range.start.line).toBe(2);
  });
});
