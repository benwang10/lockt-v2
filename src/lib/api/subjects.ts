import { supabase } from '@/lib/supabase';
import type { Goal, GoalKind, Subject } from '@/lib/types';

const SUBJECT_COLUMNS = 'id, user_id, name, color, archived_at, created_at';
const GOAL_COLUMNS =
  'id, user_id, kind, title, subject_id, weekly_target_minutes, target_date, completed_at, archived_at, created_at';

export async function fetchSubjects(userId: string): Promise<Subject[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select(SUBJECT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Subject[];
}

export async function createSubject(userId: string, name: string, color: string): Promise<Subject> {
  const { data, error } = await supabase
    .from('subjects')
    .insert({ user_id: userId, name: name.trim(), color })
    .select(SUBJECT_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('You already have a subject with that name.');
    throw error;
  }
  return data as Subject;
}

export async function updateSubject(id: string, patch: { name?: string; color?: string }): Promise<Subject> {
  const { data, error } = await supabase
    .from('subjects')
    .update({ ...patch, ...(patch.name ? { name: patch.name.trim() } : {}) })
    .eq('id', id)
    .select(SUBJECT_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('You already have a subject with that name.');
    throw error;
  }
  return data as Subject;
}

export async function setSubjectArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from('subjects')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) {
    if (error.code === '23505') throw new Error('An active subject with that name already exists.');
    throw error;
  }
}

export async function fetchGoals(userId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select(GOAL_COLUMNS)
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Goal[];
}

export async function createGoal(input: {
  userId: string;
  kind: GoalKind;
  title: string;
  subjectId: string | null;
  weeklyTargetMinutes?: number | null;
  targetDate?: string | null;
}): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: input.userId,
      kind: input.kind,
      title: input.title.trim(),
      subject_id: input.subjectId,
      weekly_target_minutes: input.kind === 'weekly_time' ? input.weeklyTargetMinutes : null,
      target_date: input.kind === 'milestone' ? (input.targetDate ?? null) : null,
    })
    .select(GOAL_COLUMNS)
    .single();
  if (error) throw error;
  return data as Goal;
}

export async function setMilestoneCompleted(goalId: string, completed: boolean): Promise<void> {
  const { error } = await supabase
    .from('goals')
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq('id', goalId);
  if (error) throw error;
}

export async function archiveGoal(goalId: string): Promise<void> {
  const { error } = await supabase.from('goals').update({ archived_at: new Date().toISOString() }).eq('id', goalId);
  if (error) throw error;
}
