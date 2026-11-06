import { Tabs } from 'expo-router/js-tabs';
import { PixelRatio, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/icon';

import { useActiveSession } from '@/providers/active-session';
import { SANS } from '@/constants/fonts';
import { useTheme } from '@/providers/theme';

function tabIcon(name: IconName) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} size={24} color={color} />;
  };
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { session } = useActiveSession();
  const insets = useSafeAreaInsets();
  const fontScale = Math.min(PixelRatio.getFontScale(), 1.6);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          // Grows with the system text size (capped) so labels never clip.
          height: 52 + Math.round(16 * fontScale) + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 6),
        },
        tabBarLabelStyle: { fontFamily: SANS.semibold, fontSize: 12, lineHeight: 16 },
      }}>
      <Tabs.Screen name="feed" options={{ title: 'Feed', tabBarIcon: tabIcon('feed') }} />
      <Tabs.Screen
        name="study"
        options={{
          title: 'Study',
          tabBarIcon: tabIcon('study'),
          // A dot on the tab while a session is running or paused.
          tabBarBadge: session ? '' : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, minWidth: 10, height: 10, borderRadius: 5, top: 4 },
          tabBarAccessibilityLabel: session ? 'Study, session in progress' : 'Study',
        }}
      />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: tabIcon('progress') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('profile') }} />
    </Tabs>
  );
}
