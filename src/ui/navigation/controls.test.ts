import { describe, expect, it } from 'vitest';
import { moveSettingFocus, moveTargetIndex, cycleFocusArea } from './buildNavigation.js';
import { reduceListSelection } from './listNavigation.js';
import { reduceLogNavigation } from './logNavigation.js';

describe('navigation reducers', () => {
  it('moves target selection like lazygit lists', () => {
    expect(moveTargetIndex(0, 5, 'down')).toBe(1);
    expect(moveTargetIndex(1, 5, 'up')).toBe(0);
    expect(moveTargetIndex(1, 5, 'top')).toBe(0);
    expect(moveTargetIndex(1, 5, 'bottom')).toBe(4);
  });

  it('moves settings focus and section focus predictably', () => {
    expect(moveSettingFocus('configuration', 'down')).toBe('platform');
    expect(moveSettingFocus('parallel', 'down')).toBe('devshell');
    expect(moveSettingFocus('devshell', 'up')).toBe('parallel');
    expect(cycleFocusArea('targets', 1)).toBe('settings');
    expect(cycleFocusArea('action', 1)).toBe('targets');
  });

  it('keeps list navigation bounded', () => {
    expect(reduceListSelection(0, 3, 'up')).toBe(0);
    expect(reduceListSelection(0, 3, 'bottom')).toBe(2);
    expect(reduceListSelection(2, 3, 'down')).toBe(2);
  });

  it('drops one line from bottom when leaving follow mode', () => {
    const next = reduceLogNavigation({ following: true, scrollOffset: 0, maxOffset: 5 }, 'up');
    expect(next.following).toBe(false);
    expect(next.scrollOffset).toBe(4);
  });

  it('returns to follow mode at the bottom', () => {
    const next = reduceLogNavigation({ following: false, scrollOffset: 2, maxOffset: 5 }, 'bottom');
    expect(next.following).toBe(true);
    expect(next.scrollOffset).toBe(5);
  });
});
