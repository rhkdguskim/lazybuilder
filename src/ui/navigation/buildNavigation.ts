export type FocusArea = 'targets' | 'settings' | 'action';
export type SettingField = 'configuration' | 'platform' | 'verbosity' | 'parallel' | 'devshell';

export interface BuildFocusState {
  focusArea: FocusArea;
  activeSetting: SettingField;
  targetIdx: number;
  targetCount: number;
}

export const SETTING_FIELDS: SettingField[] = ['configuration', 'platform', 'verbosity', 'parallel', 'devshell'];

export const cycleFocusArea = (focusArea: FocusArea, direction: 1 | -1): FocusArea => {
  const areas: FocusArea[] = ['targets', 'settings', 'action'];
  const idx = areas.indexOf(focusArea);
  return areas[(idx + direction + areas.length) % areas.length]!;
};

export const moveTargetIndex = (targetIdx: number, targetCount: number, command: 'up' | 'down' | 'top' | 'bottom'): number => {
  if (command === 'top') return 0;
  if (command === 'bottom') return Math.max(0, targetCount - 1);
  if (command === 'up') return Math.max(0, targetIdx - 1);
  return Math.min(Math.max(0, targetCount - 1), targetIdx + 1);
};

export const moveSettingFocus = (
  activeSetting: SettingField,
  command: 'up' | 'down' | 'top' | 'bottom',
): SettingField => {
  const idx = SETTING_FIELDS.indexOf(activeSetting);
  if (command === 'top') return SETTING_FIELDS[0]!;
  if (command === 'bottom') return SETTING_FIELDS[SETTING_FIELDS.length - 1]!;
  if (command === 'up') return SETTING_FIELDS[Math.max(0, idx - 1)]!;
  return SETTING_FIELDS[Math.min(SETTING_FIELDS.length - 1, idx + 1)]!;
};
