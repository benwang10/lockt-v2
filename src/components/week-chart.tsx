import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { SubjectDot } from '@/components/subject-pill';
import { AppText } from '@/components/ui/text';
import { Radius, Spacing, subjectColorOr } from '@/constants/theme';
import type { DaySegment, SubjectTotal } from '@/lib/stats';
import { formatDuration, formatDurationCompact } from '@/lib/time';
import { addLocalDays, WEEKDAY_SHORT } from '@/lib/week';
import { makeStyles, useTheme } from '@/providers/theme';

const CHART_HEIGHT = 128;
const MIN_BAR = 6;

function dayName(day: Date, style: 'long' | 'short' = 'long') {
  return day.toLocaleDateString(undefined, { weekday: style });
}

/**
 * Daily study time for a Monday-first week as stacked bars: each bar is made
 * of one segment per subject, in the subject's colour (forest green when a
 * subject has no valid colour). Segment durations come straight from
 * computeWeekStats, so they always add up to the day's total. Tap a day to
 * see its breakdown; zero-study days stay visible as an empty track.
 */
export function WeekChart({
  dailySeconds,
  dailySegments,
  subjects,
  weekStart,
}: {
  dailySeconds: number[];
  dailySegments: DaySegment[][];
  subjects: SubjectTotal[];
  weekStart: Date;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const max = Math.max(...dailySeconds, 1);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIndex = dailySeconds.findIndex((_, i) => addLocalDays(weekStart, i).getTime() === todayStart.getTime());
  const busiest = dailySeconds.indexOf(Math.max(...dailySeconds));
  const [chosen, setChosen] = useState<{ week: number; day: number } | null>(null);
  // Default selection: today (current week) or the busiest day; reset per week.
  const selected =
    chosen && chosen.week === weekStart.getTime() ? chosen.day : todayIndex >= 0 ? todayIndex : busiest;
  const colorOf = (c: string) => subjectColorOr(c, colors.accent);

  const selectedDay = addLocalDays(weekStart, selected);
  const selectedSegments = dailySegments[selected] ?? [];
  const selectedTotal = dailySeconds[selected] ?? 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.chart}>
        {dailySeconds.map((seconds, i) => {
          const day = addLocalDays(weekStart, i);
          const isToday = i === todayIndex;
          const isSelected = i === selected;
          const height = seconds > 0 ? Math.max(MIN_BAR, (seconds / max) * CHART_HEIGHT) : 4;
          const segments = dailySegments[i] ?? [];
          const description =
            seconds > 0
              ? `${formatDuration(seconds)}: ${segments.map((s) => `${s.name} ${formatDuration(s.seconds)}`).join(', ')}`
              : 'no study time';
          return (
            <Pressable
              key={i}
              style={styles.col}
              onPress={() => setChosen({ week: weekStart.getTime(), day: i })}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${dayName(day)}${isToday ? ' (today)' : ''}, ${description}`}
              accessibilityHint="Shows this day's subject breakdown">
              <AppText variant="label" color={colors.textSecondary} numberOfLines={1} style={styles.value} maxFontSizeMultiplier={1.3}>
                {seconds > 0 ? formatDurationCompact(seconds) : '–'}
              </AppText>
              <View style={styles.track}>
                {seconds > 0 ? (
                  <View style={[styles.bar, { height }, isSelected && styles.barSelected]}>
                    {segments.map((seg, j) => (
                      <View
                        key={seg.subjectId}
                        style={{
                          // Bottom-up stacking via column-reverse; hairline gaps between segments.
                          flexGrow: seg.seconds,
                          flexBasis: 0,
                          backgroundColor: colorOf(seg.color),
                          marginTop: j === segments.length - 1 ? 0 : 1,
                        }}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={[styles.empty, { height }]} />
                )}
              </View>
              <View style={[styles.dayLabel, isSelected && { backgroundColor: colors.accentSoft }]}>
                <AppText
                  variant="label"
                  color={isSelected ? colors.accentStrong : isToday ? colors.text : colors.textSecondary}
                  maxFontSizeMultiplier={1.3}>
                  {WEEKDAY_SHORT[i]}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.detail} accessibilityLiveRegion="polite">
        <AppText variant="smallStrong">
          {dayName(selectedDay)}
          {selected === todayIndex ? ' (today)' : ''} · {selectedTotal > 0 ? formatDuration(selectedTotal) : 'no study time'}
        </AppText>
        {selectedSegments.map((seg) => (
          <View key={seg.subjectId} style={styles.detailRow}>
            <SubjectDot color={colorOf(seg.color)} />
            <AppText variant="small" numberOfLines={1} style={styles.flex}>
              {seg.name}
            </AppText>
            <AppText variant="small" color={colors.textSecondary}>
              {formatDuration(seg.seconds)}
              {selectedTotal > 0 ? ` · ${Math.round((seg.seconds / selectedTotal) * 100)}%` : ''}
            </AppText>
          </View>
        ))}
      </View>

      {subjects.length > 0 ? (
        <View style={styles.legend} accessibilityLabel={`Subjects: ${subjects.map((s) => s.name).join(', ')}`}>
          {subjects.map((s) => (
            <View key={s.subjectId} style={styles.legendItem}>
              <SubjectDot color={colorOf(s.color)} size={9} />
              <AppText variant="caption" color={colors.textSecondary} numberOfLines={1} style={styles.legendText}>
                {s.name}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ProgressBar({ ratio, color }: { ratio: number; color?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color ?? colors.accent }]} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: Spacing.md },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xxs },
  col: { flex: 1, alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.xxs, borderRadius: Radius.sm },
  value: { fontSize: 10, lineHeight: 14 },
  track: { height: CHART_HEIGHT, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  bar: {
    width: '72%',
    maxWidth: 36,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    flexDirection: 'column-reverse',
    backgroundColor: c.surface,
  },
  barSelected: { borderWidth: 1.5, borderColor: c.text },
  empty: { width: '72%', maxWidth: 36, borderRadius: Radius.sm, backgroundColor: c.chartTrack },
  dayLabel: { minHeight: 24, paddingHorizontal: Spacing.xs, borderRadius: Radius.pill, justifyContent: 'center' },
  detail: { gap: Spacing.xs, backgroundColor: c.surfaceMuted, borderRadius: Radius.md, padding: Spacing.md },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flex: { flex: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.md, rowGap: Spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, maxWidth: '100%' },
  legendText: { flexShrink: 1 },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: c.chartTrack, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
}));
