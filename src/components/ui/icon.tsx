import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/providers/theme';

/** SF Symbols on iOS, Material Symbols on Android and web. */
const ICONS = {
  feed: { ios: 'house', android: 'home' },
  study: { ios: 'timer', android: 'timer' },
  progress: { ios: 'chart.bar', android: 'bar_chart' },
  profile: { ios: 'person.crop.circle', android: 'account_circle' },
  search: { ios: 'magnifyingglass', android: 'search' },
  heart: { ios: 'heart', android: 'favorite_border' },
  heartFill: { ios: 'heart.fill', android: 'favorite' },
  comment: { ios: 'bubble.left', android: 'chat_bubble' },
  music: { ios: 'music.note', android: 'music_note' },
  photo: { ios: 'photo', android: 'image' },
  play: { ios: 'play.fill', android: 'play_arrow' },
  pause: { ios: 'pause.fill', android: 'pause' },
  stop: { ios: 'stop.fill', android: 'stop' },
  close: { ios: 'xmark', android: 'close' },
  plus: { ios: 'plus', android: 'add' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left' },
  settings: { ios: 'gearshape', android: 'settings' },
  trash: { ios: 'trash', android: 'delete' },
  edit: { ios: 'pencil', android: 'edit' },
  lock: { ios: 'lock.fill', android: 'lock' },
  people: { ios: 'person.2', android: 'group' },
  check: { ios: 'checkmark', android: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  circle: { ios: 'circle', android: 'radio_button_unchecked' },
  flag: { ios: 'flag', android: 'flag' },
  target: { ios: 'target', android: 'track_changes' },
  archive: { ios: 'archivebox', android: 'archive' },
  unarchive: { ios: 'arrow.uturn.backward', android: 'unarchive' },
  external: { ios: 'arrow.up.right.square', android: 'open_in_new' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome' },
  globe: { ios: 'person.2.fill', android: 'group' },
  followAdd: { ios: 'person.badge.plus', android: 'person_add' },
  offline: { ios: 'wifi.slash', android: 'cloud_off' },
  clock: { ios: 'clock', android: 'schedule' },
  trophy: { ios: 'trophy', android: 'emoji_events' },
  book: { ios: 'book', android: 'menu_book' },
  send: { ios: 'paperplane.fill', android: 'send' },
  info: { ios: 'info.circle', android: 'info' },
  calendar: { ios: 'calendar', android: 'calendar_today' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh' },
  bell: { ios: 'bell', android: 'notifications' },
  bellBadge: { ios: 'bell.badge', android: 'notifications_active' },
  moon: { ios: 'moon', android: 'dark_mode' },
  sun: { ios: 'sun.max', android: 'light_mode' },
  palette: { ios: 'paintpalette', android: 'palette' },
  rain: { ios: 'cloud.rain', android: 'water_drop' },
  bubbles: { ios: 'bubbles.and.sparkles', android: 'bubble_chart' },
  leaf: { ios: 'leaf', android: 'eco' },
  stopCircle: { ios: 'circle.slash', android: 'block' },
  note: { ios: 'text.bubble', android: 'sticky_note_2' },
  buddies: { ios: 'person.2.badge.plus', android: 'group_add' },
  eye: { ios: 'eye', android: 'visibility' },
  eyeOff: { ios: 'eye.slash', android: 'visibility_off' },
  star: { ios: 'star', android: 'star' },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 22,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const icon = ICONS[name];
  return (
    <SymbolView
      name={{ ios: icon.ios, android: icon.android, web: icon.android }}
      size={size}
      tintColor={color ?? colors.text}
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
