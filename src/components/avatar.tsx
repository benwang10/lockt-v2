import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { AVATAR_COLORS } from '@/constants/theme';
import { useSignedUrl } from '@/hooks/use-signed-url';
import { makeStyles } from '@/providers/theme';

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({
  path,
  name,
  seed,
  size = 40,
  localUri,
}: {
  path: string | null | undefined;
  name: string;
  seed: string;
  size?: number;
  /** Preview of a just-picked image before upload. */
  localUri?: string | null;
}) {
  const styles = useStyles();
  const { url } = useSignedUrl('avatars', localUri ? null : path);
  const source = localUri ?? url;
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View
      style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(seed) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {source ? (
        <Image source={{ uri: source }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        // Initials scale with the avatar so they never overflow small sizes.
        <AppText
          variant={size > 56 ? 'title' : 'label'}
          color="#FFFFFF"
          numberOfLines={1}
          maxFontSizeMultiplier={1}
          style={{ fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.5) }}>
          {initials || '?'}
        </AppText>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  base: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
}));
