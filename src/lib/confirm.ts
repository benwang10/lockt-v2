import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation dialog. React Native Web's Alert is a no-op, so
 * the browser preview falls back to window.confirm.
 */
export function confirmAction(opts: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = opts.message ? `${opts.title}\n\n${opts.message}` : opts.title;
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(text) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: opts.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
