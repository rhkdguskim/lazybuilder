export const truncateEnd = (value: string, maxLength: number): string => {
  if (maxLength <= 0) return '';
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
};

export const truncateMiddle = (value: string, maxLength: number): string => {
  if (maxLength <= 0) return '';
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);

  const visible = maxLength - 3;
  const head = Math.ceil(visible / 2);
  const tail = Math.floor(visible / 2);
  return `${value.slice(0, head)}...${value.slice(value.length - tail)}`;
};

export const compactPath = (value: string, maxLength: number): string => {
  const home = [process.env.HOME, process.env.USERPROFILE]
    .filter((candidate): candidate is string => !!candidate)
    .sort((a, b) => b.length - a.length)
    .find(candidate => value.toLowerCase().startsWith(candidate.toLowerCase()));
  const normalized = home
    ? `~${value.slice(home.length)}`
    : value;

  if (normalized.length <= maxLength) return normalized;

  const parts = normalized.split(/[\\/]/).filter(Boolean);
  if (parts.length >= 2) {
    const tail = parts.slice(-2).join('/');
    const prefix = normalized.startsWith('~') ? '~' : normalized.startsWith('/') ? '' : parts[0];
    const compact = prefix ? `${prefix}/.../${tail}` : `.../${tail}`;
    if (compact.length <= maxLength) return compact;
  }

  return truncateMiddle(normalized, maxLength);
};
