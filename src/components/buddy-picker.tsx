import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { searchProfiles } from '@/lib/api/profiles';
import { checkedA11y, webSpaceActivates } from '@/lib/a11y';
import { friendlyError } from '@/lib/errors';
import type { BuddyInvite, BuddyStatus, ProfileSummary } from '@/lib/types';
import { makeStyles, useTheme } from '@/providers/theme';

const STATUS_LABEL: Record<BuddyStatus, string> = {
  pending: 'Invited',
  accepted: 'Study buddy',
  declined: 'Declined',
  revoked: 'Invitation expired',
};

export const MAX_BUDDIES = 10;

/**
 * Study buddies on the completion / edit screen.
 *
 * Existing invitations are listed with their status (only the owner sees
 * pending ones). New people are *staged* here and invited after the session
 * is saved with "Followers" visibility, so invitations never go out for a
 * post that isn't shared. The database enforces every rule again.
 */
export function BuddyPicker({
  myId,
  invites,
  staged,
  onStage,
  onRemoveInvite,
  enabled,
  disabledReason,
  busyInviteId,
}: {
  myId: string;
  invites: BuddyInvite[];
  staged: ProfileSummary[];
  onStage: (next: ProfileSummary[]) => void;
  onRemoveInvite: (invite: BuddyInvite) => void;
  enabled: boolean;
  disabledReason?: string;
  busyInviteId?: string | null;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ q: string; people: ProfileSummary[]; error: string | null } | null>(null);
  const q = query.trim();
  const searching = q.length >= 2;

  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchProfiles(q)
        .then((people) => !cancelled && setResult({ q, people, error: null }))
        .catch((e) => !cancelled && setResult({ q, people: [], error: friendlyError(e) }));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, searching]);

  const invitedIds = new Set(invites.map((i) => i.buddy_id));
  const stagedIds = new Set(staged.map((p) => p.id));
  const active = invites.filter((i) => i.status === 'pending' || i.status === 'accepted').length;
  const roomLeft = MAX_BUDDIES - active - staged.length;
  const current = searching && result?.q === q ? result : null;

  const toggle = (person: ProfileSummary) => {
    if (person.id === myId || invitedIds.has(person.id)) return; // no self / duplicate invitations
    if (stagedIds.has(person.id)) onStage(staged.filter((p) => p.id !== person.id));
    else if (roomLeft > 0) onStage([...staged, person]);
  };

  return (
    <View style={styles.wrap}>
      {invites.map((invite) => {
        const removable = invite.status !== 'declined';
        return (
          <View key={invite.id} style={styles.row}>
            <Avatar path={invite.buddy.avatar_path} name={invite.buddy.display_name} seed={invite.buddy.id} size={36} />
            <View style={styles.flex}>
              <AppText variant="smallStrong" numberOfLines={1}>
                {invite.buddy.display_name}
              </AppText>
              <AppText variant="caption" color={invite.status === 'accepted' ? colors.accentStrong : colors.textSecondary}>
                @{invite.buddy.username} · {STATUS_LABEL[invite.status]}
              </AppText>
            </View>
            {removable ? (
              <Button
                title={invite.status === 'accepted' ? 'Remove' : 'Cancel invite'}
                variant="dangerGhost"
                size="sm"
                loading={busyInviteId === invite.id}
                onPress={() => onRemoveInvite(invite)}
                accessibilityLabel={`${invite.status === 'accepted' ? 'Remove' : 'Cancel invitation for'} ${invite.buddy.display_name}`}
              />
            ) : null}
          </View>
        );
      })}

      {staged.map((person) => (
        <View key={person.id} style={styles.row}>
          <Avatar path={person.avatar_path} name={person.display_name} seed={person.id} size={36} />
          <View style={styles.flex}>
            <AppText variant="smallStrong" numberOfLines={1}>
              {person.display_name}
            </AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              @{person.username} · Will be invited when you save
            </AppText>
          </View>
          <IconButton icon="close" label={`Don't invite ${person.display_name}`} size={18} onPress={() => toggle(person)} />
        </View>
      ))}

      {enabled ? (
        <>
          <TextField
            label="Invite study buddies"
            hideLabel
            value={query}
            onChangeText={setQuery}
            placeholder="Search people to invite"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {current?.error ? (
            <AppText variant="small" color={colors.danger}>
              {current.error}
            </AppText>
          ) : null}
          {searching && !current ? (
            <AppText variant="small" color={colors.textSecondary}>
              Searching…
            </AppText>
          ) : null}
          {current && !current.error && current.people.length === 0 ? (
            <AppText variant="small" color={colors.textSecondary}>
              Nobody matches “{q}”.
            </AppText>
          ) : null}
          {current?.people.slice(0, 6).map((person) => {
            const invited = invitedIds.has(person.id);
            const selected = stagedIds.has(person.id);
            const disabled = invited || (!selected && roomLeft <= 0);
            return (
              <Pressable
                key={person.id}
                onPress={() => toggle(person)}
                disabled={disabled}
                accessibilityRole="checkbox"
                {...checkedA11y(selected || invited, disabled)}
                {...webSpaceActivates(() => toggle(person), disabled)}
                accessibilityLabel={`${person.display_name}, @${person.username}${invited ? ', already invited' : ''}`}
                style={({ pressed }) => [styles.row, styles.result, pressed && { backgroundColor: colors.surfaceMuted }, disabled && styles.dim]}>
                <Avatar path={person.avatar_path} name={person.display_name} seed={person.id} size={36} />
                <View style={styles.flex}>
                  <AppText variant="smallStrong" numberOfLines={1}>
                    {person.display_name}
                  </AppText>
                  <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                    @{person.username}
                    {invited ? ' · already invited' : ''}
                  </AppText>
                </View>
                <Icon
                  name={selected || invited ? 'checkCircle' : 'circle'}
                  size={22}
                  color={selected || invited ? colors.accent : colors.textSecondary}
                />
              </Pressable>
            );
          })}
          <AppText variant="caption" color={colors.textMuted}>
            Buddies are credited on this post once they accept. They need to follow you to accept, and it doesn’t add
            time to their totals. Up to {MAX_BUDDIES}.
          </AppText>
        </>
      ) : (
        <AppText variant="small" color={colors.textSecondary}>
          {disabledReason}
        </AppText>
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: TOUCH_TARGET },
  result: { borderRadius: Radius.md, paddingHorizontal: Spacing.xs },
  dim: { opacity: 0.55 },
  flex: { flex: 1 },
}));
