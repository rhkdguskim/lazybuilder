export interface LogNavigationState {
  following: boolean;
  scrollOffset: number;
  maxOffset: number;
}

export type LogCommand = 'up' | 'down' | 'top' | 'bottom' | 'toggle-follow';

export const reduceLogNavigation = (state: LogNavigationState, command: LogCommand): LogNavigationState => {
  if (command === 'toggle-follow') {
    const following = !state.following;
    return {
      ...state,
      following,
      scrollOffset: following ? state.maxOffset : state.scrollOffset,
    };
  }

  if (command === 'top') {
    return { ...state, following: false, scrollOffset: 0 };
  }

  if (command === 'bottom') {
    return { ...state, following: true, scrollOffset: state.maxOffset };
  }

  if (command === 'up') {
    const base = state.following ? state.maxOffset : state.scrollOffset;
    return { ...state, following: false, scrollOffset: Math.max(0, base - 1) };
  }

  const base = state.following ? state.maxOffset : state.scrollOffset;
  const nextOffset = Math.min(state.maxOffset, base + 1);
  return {
    ...state,
    following: nextOffset >= state.maxOffset,
    scrollOffset: nextOffset,
  };
};
