import { queryOptions, useQuery } from '@tanstack/react-query'
import { withOfflineFallback } from '@/lib/offline/bank'
import { PLAN_STORAGE_KEYS } from '@/lib/planProgress'
import { parseStudyDays, type StudyDays } from '@/lib/studyDays'
import { supabase } from '@/lib/supabase'

/** Used until she sets her own target. Same default as the database. */
export const DEFAULT_DAILY_TARGET = 50
export const DAILY_TARGET_CHOICES = [25, 50, 75, 100, 150]

export type StudySettings = {
  /** "YYYY-MM-DD", or null when not set yet */
  examDate: string | null
  dailyTarget: number
  /** full, light or rest, per day (the Plan page's "This week") */
  studyDays: StudyDays
}

/** Her planner settings (RLS returns only her own row; there is none until she saves). */
export const studySettingsOptions = queryOptions({
  queryKey: ['study-settings'],
  // No internet: the settings saved on this device the last time it was online.
  queryFn: () =>
    withOfflineFallback(async () => {
      const { data, error } = await supabase.from('study_settings').select('exam_date, daily_target, study_days').maybeSingle()
      if (error) throw error
      return toStudySettings(data)
    }, (bank) => toStudySettings(bank.studySettings)),
})

function toStudySettings(row: { exam_date: string | null; daily_target: number | null; study_days?: unknown } | null): StudySettings {
  return {
    examDate: row?.exam_date ?? null,
    dailyTarget: row?.daily_target && row.daily_target > 0 ? row.daily_target : DEFAULT_DAILY_TARGET,
    studyDays: parseStudyDays(row?.study_days),
  }
}

export function useStudySettings() {
  return useQuery(studySettingsOptions)
}

/**
 * Saves the exam date and daily goal (insert the first time, update after that). user_id is filled in by the database.
 * Only these two columns are written, so her study days stay as they are.
 */
export async function saveStudySettings(settings: Pick<StudySettings, 'examDate' | 'dailyTarget'>) {
  const { error } = await supabase
    .from('study_settings')
    .upsert({ exam_date: settings.examDate, daily_target: settings.dailyTarget }, { onConflict: 'user_id' })
  if (error) throw error
}

/** Saves her study days only (the exam date and daily goal stay as they are). */
export async function saveStudyDays(studyDays: StudyDays) {
  const { error } = await supabase.from('study_settings').upsert({ study_days: studyDays }, { onConflict: 'user_id' })
  if (error) throw error
}

/** Device-only progress keys (unfinished mock exam, milestones already shown). */
// On this device: a mock exam in progress, streak notes seen, and Today's plan with its progress
// (made from her history, so it's made again from zero after a reset).
const LOCAL_PROGRESS_KEYS = ['projectrmt:mock-exam', 'projectrmt:seen-milestones', ...PLAN_STORAGE_KEYS]
const FLASHCARD_SETTINGS_KEY = 'projectrmt:flashcards'

/**
 * Deletes all of her progress: answers, quiz/mock sessions, flashcard schedule, and today's plan on this device.
 * Keeps her own questions, books, uploads, exam date and daily goal.
 */
export async function resetProgress() {
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw new Error('Not signed in')

  // Attempts first, then the sessions they belong to, then the flashcard schedule.
  for (const table of ['attempts', 'quiz_sessions', 'review_states'] as const) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error) throw error
  }

  try {
    LOCAL_PROGRESS_KEYS.forEach((key) => localStorage.removeItem(key))
    // Keep her "new cards per day" choice; only clear today's count.
    const flashcards = JSON.parse(localStorage.getItem(FLASHCARD_SETTINGS_KEY) ?? 'null') as Record<string, unknown> | null
    if (flashcards) localStorage.setItem(FLASHCARD_SETTINGS_KEY, JSON.stringify({ ...flashcards, newDoneToday: 0 }))
  } catch {
    // storage blocked: nothing saved on this device to clear
  }
}
