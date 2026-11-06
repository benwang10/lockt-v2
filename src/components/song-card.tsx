import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { detectMusicService } from '@/lib/validation';
import { makeStyles, useTheme } from '@/providers/theme';

const SERVICE_LABEL = { spotify: 'Spotify', apple_music: 'Apple Music' } as const;

/** The song a user attached to express the session's mood. Opens the link. */
export function SongCard({ title, artist, url }: { title: string; artist?: string | null; url?: string | null }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const service = url ? detectMusicService(url) : null;
  const open = async () => {
    if (!url || !service) return;
    // Prefer the installed music app; fall back to an in-app browser.
    const canOpen = Platform.OS !== 'web' && (await Linking.canOpenURL(url).catch(() => false));
    if (canOpen) await Linking.openURL(url);
    else await WebBrowser.openBrowserAsync(url);
  };
  const label = `Song: ${title}${artist ? ` by ${artist}` : ''}${service ? `. Opens in ${SERVICE_LABEL[service]}` : ''}`;
  const body = (
    <>
      <View style={styles.art}>
        <Icon name="music" size={20} color={colors.onInverse} />
      </View>
      <View style={styles.text}>
        <AppText variant="smallStrong" numberOfLines={1}>
          {title}
        </AppText>
        {artist ? (
          <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
            {artist}
          </AppText>
        ) : null}
      </View>
      {service ? (
        <View style={styles.service}>
          <AppText variant="caption" color={colors.textSecondary}>
            {SERVICE_LABEL[service]}
          </AppText>
          <Icon name="external" size={14} color={colors.textSecondary} />
        </View>
      ) : null}
    </>
  );
  if (!service) {
    return (
      <View style={styles.card} accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceMuted }]}>
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: c.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    minHeight: 56,
  },
  art: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: c.inverse,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  service: { flexDirection: 'row', alignItems: 'center', gap: 4 },
}));
