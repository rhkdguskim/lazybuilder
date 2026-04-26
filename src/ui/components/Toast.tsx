import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { theme, statusColor, statusSymbol } from '../themes/theme.js';
import type { Notification } from '../store/notifications.js';

interface ToastProps {
  /** Maximum width hint, used to truncate long messages. */
  width?: number;
  /** Maximum number of toasts to show simultaneously. */
  max?: number;
}

/**
 * Top-right toast stack. Each toast has an optional TTL; when it expires,
 * the toast is auto-dismissed via the store action.
 *
 * When more notifications exist than `max`, a "+N more" line surfaces below
 * the stack so users know they have hidden state.
 */
export const Toast: React.FC<ToastProps> = ({ width = 56, max = 3 }) => {
  const notifications = useAppStore(s => s.notifications);
  if (notifications.length === 0) return null;

  const visible = notifications.slice(0, max);
  const hidden = Math.max(0, notifications.length - visible.length);

  return (
    <Box flexDirection="column" flexShrink={0} alignSelf="flex-end" overflow="hidden">
      {visible.map(notification => (
        <ToastRow key={notification.id} notification={notification} width={width} />
      ))}
      {hidden > 0 ? (
        <Text color={theme.color.text.muted as any} dimColor wrap="truncate">
          +{hidden} more notification{hidden === 1 ? '' : 's'}
        </Text>
      ) : null}
    </Box>
  );
};

const ToastRow: React.FC<{ notification: Notification; width: number }> = ({ notification, width }) => {
  const dismiss = useAppStore(s => s.dismissNotification);

  useEffect(() => {
    if (notification.ttlMs == null || notification.ttlMs <= 0) return;
    const t = setTimeout(() => dismiss(notification.id), notification.ttlMs);
    return () => clearTimeout(t);
  }, [notification.id, notification.ttlMs, dismiss]);

  const color = statusColor(notification.severity);
  const symbol = statusSymbol(notification.severity);

  return (
    <Box
      borderStyle={theme.border.style}
      borderColor={color as any}
      paddingX={1}
      width={width}
      flexShrink={0}
      overflow="hidden"
    >
      <Box flexDirection="column" overflow="hidden">
        <Text wrap="truncate">
          <Text color={color as any} bold>{symbol} </Text>
          <Text bold>{notification.title}</Text>
        </Text>
        {notification.detail ? (
          <Text color={theme.color.text.muted as any} wrap="truncate">{notification.detail}</Text>
        ) : null}
        {notification.action ? (
          <Text wrap="truncate">
            <Text color={theme.color.accent.key as any} bold>[{notification.action.key}]</Text>
            <Text color={theme.color.text.muted as any}> {notification.action.label}</Text>
          </Text>
        ) : null}
      </Box>
    </Box>
  );
};
