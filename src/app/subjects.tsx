import { useState } from 'react';
import {  } from 'react-native';

import { SubjectEditor } from '@/components/subject-editor';
import { SubjectDot } from '@/components/subject-pill';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { createSubject, fetchSubjects, setSubjectArchived, updateSubject } from '@/lib/api/subjects';
import { confirmAction } from '@/lib/confirm';
import { friendlyError } from '@/lib/errors';
import { invalidate } from '@/lib/events';
import type { Subject } from '@/lib/types';
import { useMe } from '@/providers/auth';
import { useToast } from '@/providers/toast';
import { makeStyles, useTheme } from '@/providers/theme';

export default function SubjectsScreen() {
  const { colors } = useTheme();
  const { userId } = useMe();
  const toast = useToast();
  const subjects = useQuery(() => fetchSubjects(userId), [userId], { topics: ['subjects'] });
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  if (subjects.loading) return <LoadingState />;
  if (subjects.error && !subjects.data) return <ErrorState message={subjects.error} onRetry={subjects.reload} />;
  const active = (subjects.data ?? []).filter((s) => !s.archived_at);
  const archived = (subjects.data ?? []).filter((s) => s.archived_at);

  const changed = async () => {
    invalidate('subjects', 'sessions');
    await subjects.reload();
  };

  const toggleArchive = async (s: Subject) => {
    if (!s.archived_at) {
      const ok = await confirmAction({
        title: `Archive ${s.name}?`,
        message: 'It won’t appear when starting sessions. Past sessions keep their subject and still count in your history.',
        confirmLabel: 'Archive',
      });
      if (!ok) return;
    }
    try {
      await setSubjectArchived(s.id, !s.archived_at);
      await changed();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  return (
    <Screen scroll edges={['bottom', 'left', 'right']}>
      {editing === 'new' ? (
        <Card>
          <SubjectEditor
            submitLabel="Add subject"
            onCancel={() => setEditing(null)}
            onSubmit={async (name, color) => {
              await createSubject(userId, name, color);
              setEditing(null);
              await changed();
            }}
          />
        </Card>
      ) : (
        <Button title="New subject" icon="plus" onPress={() => setEditing('new')} />
      )}

      <SectionHeader title="Active" />
      {active.length === 0 ? (
        <AppText variant="small" color={colors.textSecondary}>
          No subjects yet.
        </AppText>
      ) : (
        active.map((s) =>
          editing === s.id ? (
            <Card key={s.id}>
              <SubjectEditor
                initialName={s.name}
                initialColor={s.color}
                submitLabel="Save"
                onCancel={() => setEditing(null)}
                onSubmit={async (name, color) => {
                  await updateSubject(s.id, { name, color });
                  setEditing(null);
                  await changed();
                }}
              />
              <AppText variant="caption" color={colors.textSecondary}>
                Renaming updates the subject on all past sessions too.
              </AppText>
            </Card>
          ) : (
            <SubjectRow key={s.id} subject={s} onEdit={() => setEditing(s.id)} onArchive={() => toggleArchive(s)} />
          ),
        )
      )}

      {archived.length > 0 ? (
        <>
          <SectionHeader title="Archived" />
          {archived.map((s) => (
            <SubjectRow key={s.id} subject={s} onArchive={() => toggleArchive(s)} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function SubjectRow({ subject, onEdit, onArchive }: { subject: Subject; onEdit?: () => void; onArchive: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const archived = !!subject.archived_at;
  return (
    <Card style={styles.row}>
      <SubjectDot color={subject.color} size={14} />
      <AppText variant="bodyStrong" style={styles.flex} color={archived ? colors.textSecondary : colors.text}>
        {subject.name}
      </AppText>
      {onEdit ? <IconButton icon="edit" label={`Edit ${subject.name}`} onPress={onEdit} /> : null}
      <IconButton
        icon={archived ? 'unarchive' : 'archive'}
        label={archived ? `Restore ${subject.name}` : `Archive ${subject.name}`}
        onPress={onArchive}
      />
    </Card>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  flex: { flex: 1 },
}));
