import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH, Spacing } from '@/constants/theme';
import { makeStyles, useTheme } from '@/providers/theme';

/**
 * Standard screen container: safe areas, neutral background, keyboard
 * avoidance and an optional scroll view that keeps taps working while the
 * keyboard is open.
 */
export function Screen({
  children,
  scroll = false,
  edges = ['top', 'left', 'right'],
  contentStyle,
  refreshing,
  onRefresh,
  footer,
  keyboardOffset = 0,
  background,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Pinned below the scroll area (e.g. a primary action); stays above the keyboard. */
  footer?: ReactNode;
  keyboardOffset?: number;
  /** Decorative layer rendered behind the content (e.g. the study background). */
  background?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {background}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        keyboardVerticalOffset={keyboardOffset}>
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, contentStyle]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
              ) : undefined
            }>
            <View style={styles.column}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[styles.flex, contentStyle]}>{children}</View>
        )}
        {footer ? (
          <View style={styles.footer}>
            {/* Same centred column as the content, so actions line up with it on wide screens. */}
            <View style={styles.footerColumn}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Centers content and caps width on tablets / web. */
export function ContentColumn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.column, style]}>{children}</View>;
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  column: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    gap: Spacing.lg,
  },
  footerColumn: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    backgroundColor: c.background,
  },
}));
