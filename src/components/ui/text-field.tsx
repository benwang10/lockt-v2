import { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { Radius, Spacing, Type } from '@/constants/theme';

import { makeStyles, useTheme } from '@/providers/theme';

import { AppText } from './text';

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
  /** Show a character counter when maxLength is set. */
  showCount?: boolean;
  hideLabel?: boolean;
};

export const TextField = forwardRef<TextInputInstance, Props>(function TextField(
  { label, error, hint, showCount, hideLabel, style, multiline, maxLength, value, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.accent : colors.border;
  // A thicker focus/error border is compensated in padding so text never shifts.
  const thick = focused || !!error;
  const length = (value ?? '').length;
  const nearLimit = !!maxLength && length >= maxLength * 0.9;
  return (
    <View style={styles.wrapper}>
      {!hideLabel ? (
        <AppText variant="smallStrong" color={colors.text}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        keyboardAppearance={scheme}
        multiline={multiline}
        maxLength={maxLength}
        value={value}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          multiline && styles.multiline,
          { borderColor, borderWidth: thick ? 2 : 1, margin: thick ? 0 : 1 },
          style,
        ]}
        {...rest}
      />
      {error || hint || (showCount && maxLength) ? (
        <View style={styles.meta}>
          <AppText
            variant="caption"
            color={error ? colors.danger : colors.textSecondary}
            style={styles.metaText}
            accessibilityLiveRegion={error ? 'polite' : undefined}>
            {error ?? hint ?? ''}
          </AppText>
          {showCount && maxLength ? (
            <AppText
              variant="caption"
              color={nearLimit ? colors.warning : colors.textSecondary}
              accessibilityLabel={`${length} of ${maxLength} characters used`}>
              {length}/{maxLength}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const useStyles = makeStyles((c) => ({
  wrapper: { gap: Spacing.xs + 2 },
  input: {
    // No lineHeight on single-line inputs: iOS would push the text off-centre.
    fontFamily: Type.body.fontFamily,
    fontSize: Type.body.fontSize,
    color: c.text,
    backgroundColor: c.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.md,
    minHeight: 48,
  },
  multiline: {
    lineHeight: Type.body.lineHeight,
    minHeight: 96,
    textAlignVertical: 'top',
    paddingTop: Spacing.md,
  },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  metaText: { flex: 1 },
}));
