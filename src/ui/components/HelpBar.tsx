import React from 'react';
import { KeyHints, type KeyHint } from './KeyHints.js';

interface HelpBarProps {
  items: Array<{ key: string; label: string }>;
}

/** @deprecated Prefer KeyHints directly. Kept for backwards compatibility. */
export const HelpBar: React.FC<HelpBarProps> = ({ items }) => {
  const hints: KeyHint[] = items.map(item => ({ key: item.key, label: item.label }));
  return <KeyHints hints={hints} asFooter />;
};
