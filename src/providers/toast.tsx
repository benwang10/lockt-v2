import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useTheme } from '@/providers/theme';

type Toast = { id: number; message: string; tone: 'info' | 'error' };

const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

/** Transient messages, e.g. when an optimistic update had to be rolled back. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [toast, setToast] = useState<Toast | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
    }, 3200);
    return () => clearTimeout(timer);
  }, [toast, opacity]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={[styles.host, { top: insets.top + Spacing.sm }]}>
          <Animated.View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={[styles.toast, { opacity, backgroundColor: toast.tone === 'error' ? colors.danger : colors.inverse }]}>
            <AppText variant="smallStrong" color={toast.tone === 'error' ? colors.onDanger : colors.onInverse}>
              {toast.message}
            </AppText>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

const useStyles = makeStyles((c) => ({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: Spacing.lg },
  toast: {
    maxWidth: 520,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
}));
