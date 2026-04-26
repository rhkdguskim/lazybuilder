import { describe, it, expect } from 'vitest';
import {
  parseCsproj,
  offsetToPosition,
  positionToOffset,
  positionInRange,
} from './csproj.js';
import {
  SAMPLE_CSPROJ_NET8,
  SAMPLE_CSPROJ_MULTITARGET,
  SAMPLE_CSPROJ_MAUI,
  SAMPLE_VCXPROJ,
} from '../../__fixtures__/projects.js';

describe('parseCsproj', () => {
  it('captures TargetFramework value and inner-text range for net8.0 csproj', () => {
    const tokens = parseCsproj(SAMPLE_CSPROJ_NET8);
    expect(tokens.targetFramework?.value).toBe('net8.0');
    expect(tokens.targetFrameworks).toBeNull();

    // Range start should be just after `<TargetFramework>`. In SAMPLE_CSPROJ_NET8
    // the line is `    <TargetFramework>net8.0</TargetFramework>` (line index 2).
    expect(tokens.targetFramework?.range.start.line).toBe(2);
    expect(tokens.targetFramework?.range.end.line).toBe(2);

    // Verify the captured offsets actually point at "net8.0" in the source text.
    const startOffset = positionToOffset(
      SAMPLE_CSPROJ_NET8,
      tokens.targetFramework!.range.start,
    );
    const endOffset = positionToOffset(
      SAMPLE_CSPROJ_NET8,
      tokens.targetFramework!.range.end,
    );
    expect(SAMPLE_CSPROJ_NET8.slice(startOffset, endOffset)).toBe('net8.0');
  });

  it('captures TargetFrameworks (plural) for multi-target csproj', () => {
    const tokens = parseCsproj(SAMPLE_CSPROJ_MULTITARGET);
    expect(tokens.targetFramework).toBeNull();
    expect(tokens.targetFrameworks?.value).toBe('net6.0;net8.0');

    const startOffset = positionToOffset(
      SAMPLE_CSPROJ_MULTITARGET,
      tokens.targetFrameworks!.range.start,
    );
    const endOffset = positionToOffset(
      SAMPLE_CSPROJ_MULTITARGET,
      tokens.targetFrameworks!.range.end,
    );
    expect(SAMPLE_CSPROJ_MULTITARGET.slice(startOffset, endOffset)).toBe(
      'net6.0;net8.0',
    );
  });

  it('captures platform-suffixed TFM (net8.0-android) for MAUI csproj', () => {
    const tokens = parseCsproj(SAMPLE_CSPROJ_MAUI);
    expect(tokens.targetFramework?.value).toBe('net8.0-android');
    expect(tokens.platformToolsets).toEqual([]);
  });

  it('captures vcxproj PlatformToolset and WindowsTargetPlatformVersion', () => {
    const tokens = parseCsproj(SAMPLE_VCXPROJ);
    expect(tokens.targetFramework).toBeNull();
    expect(tokens.platformToolsets).toHaveLength(1);
    expect(tokens.platformToolsets[0]?.value).toBe('v143');
    expect(tokens.windowsTargetPlatformVersions).toHaveLength(1);
    expect(tokens.windowsTargetPlatformVersions[0]?.value).toBe(
      '10.0.22621.0',
    );

    // Verify the toolset range points at the value, not the tag.
    const ts = tokens.platformToolsets[0]!;
    const startOffset = positionToOffset(SAMPLE_VCXPROJ, ts.range.start);
    const endOffset = positionToOffset(SAMPLE_VCXPROJ, ts.range.end);
    expect(SAMPLE_VCXPROJ.slice(startOffset, endOffset)).toBe('v143');
  });

  it('returns empty result when no PropertyGroup or known tags are present', () => {
    const tokens = parseCsproj('<Project></Project>');
    expect(tokens.targetFramework).toBeNull();
    expect(tokens.targetFrameworks).toBeNull();
    expect(tokens.platformToolsets).toEqual([]);
    expect(tokens.windowsTargetPlatformVersions).toEqual([]);
  });

  it('returns empty result for completely empty input without throwing', () => {
    expect(() => parseCsproj('')).not.toThrow();
    const tokens = parseCsproj('');
    expect(tokens.targetFramework).toBeNull();
    expect(tokens.targetFrameworks).toBeNull();
  });

  it('returns empty result for malformed XML without throwing', () => {
    const malformed =
      '<Project><PropertyGroup><TargetFramework>net8.0';
    expect(() => parseCsproj(malformed)).not.toThrow();
    const tokens = parseCsproj(malformed);
    // No closing tag → regex misses → null is acceptable.
    expect(tokens.targetFramework).toBeNull();
  });

  it('captures multiple PlatformToolset entries when present', () => {
    const text = `<Project>
  <PropertyGroup><PlatformToolset>v142</PlatformToolset></PropertyGroup>
  <PropertyGroup><PlatformToolset>v143</PlatformToolset></PropertyGroup>
</Project>`;
    const tokens = parseCsproj(text);
    expect(tokens.platformToolsets.map(t => t.value)).toEqual(['v142', 'v143']);
  });

  it('range character offsets correctly point to value, not the tag', () => {
    // Inline csproj where we know exact column of "net8.0".
    const text = '<Project><TargetFramework>net8.0</TargetFramework></Project>';
    const tokens = parseCsproj(text);
    expect(tokens.targetFramework?.range.start.line).toBe(0);
    // `<Project>` is 9 chars, then `<TargetFramework>` is 17 chars → value starts at 26.
    expect(tokens.targetFramework?.range.start.character).toBe(26);
    expect(tokens.targetFramework?.range.end.character).toBe(26 + 'net8.0'.length);
  });
});

describe('offsetToPosition / positionToOffset', () => {
  it('roundtrips an offset through position back to offset', () => {
    const text = 'line0\nline1\nline2';
    for (const offset of [0, 3, 6, 11, 14, text.length]) {
      const pos = offsetToPosition(text, offset);
      expect(positionToOffset(text, pos)).toBe(offset);
    }
  });

  it('handles a position past the last line by clamping to text length', () => {
    const text = 'short';
    expect(positionToOffset(text, { line: 99, character: 0 })).toBe(text.length);
  });

  it('returns line 0 for the very first character', () => {
    const text = 'hello\nworld';
    expect(offsetToPosition(text, 0)).toEqual({ line: 0, character: 0 });
  });
});

describe('positionInRange', () => {
  const range = {
    start: { line: 1, character: 5 },
    end: { line: 1, character: 10 },
  };

  it('returns true for positions strictly inside the range', () => {
    expect(positionInRange({ line: 1, character: 7 }, range)).toBe(true);
  });

  it('returns true on the inclusive boundaries', () => {
    expect(positionInRange({ line: 1, character: 5 }, range)).toBe(true);
    expect(positionInRange({ line: 1, character: 10 }, range)).toBe(true);
  });

  it('returns false for positions outside the line', () => {
    expect(positionInRange({ line: 0, character: 7 }, range)).toBe(false);
    expect(positionInRange({ line: 2, character: 7 }, range)).toBe(false);
  });

  it('returns false for positions on the line but outside the columns', () => {
    expect(positionInRange({ line: 1, character: 4 }, range)).toBe(false);
    expect(positionInRange({ line: 1, character: 11 }, range)).toBe(false);
  });
});
