export type ListCommand = 'up' | 'down' | 'top' | 'bottom';

export const reduceListSelection = (selectedIdx: number, itemCount: number, command: ListCommand): number => {
  if (itemCount <= 0) return 0;
  if (command === 'top') return 0;
  if (command === 'bottom') return itemCount - 1;
  if (command === 'up') return Math.max(0, selectedIdx - 1);
  return Math.min(itemCount - 1, selectedIdx + 1);
};
