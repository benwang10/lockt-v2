import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useSignedUrl } from '@/hooks/use-signed-url';
import { makeStyles, useTheme } from '@/providers/theme';

export function SessionPhoto({ path, localUri, alt }: { path?: string | null; localUri?: string | null; alt: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { url, failed } = useSignedUrl('session-photos', localUri ? null : path);
  const source = localUri ?? url;
  return (
    <View style={styles.frame} accessibilityRole="image" accessibilityLabel={alt}>
      {source ? (
        <Image source={{ uri: source }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : failed ? (
        <View style={styles.center}>
          <Icon name="photo" color={colors.textMuted} />
          <AppText variant="caption" color={colors.textMuted}>
            Photo unavailable
          </AppText>
        </View>
      ) : (
        <ActivityIndicator color={colors.textMuted} />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  frame: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center', gap: Spacing.xs },
}));
