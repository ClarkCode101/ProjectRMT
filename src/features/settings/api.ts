import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Used until she sets her own target. Same default as the database. */
export const DEFAULT_DAILY_TARGET = 50
export const DAILY_TARGET_CHOICES = [25, 50, 75, 100, 150]

export type StudySettings = {
  /** "YYYY-MM-DD", or null when not set yet */
  examDate: string | null
  dailyTarget: number
}

/** Her planner settings (RLS returns only her own row; there is none until she saves). */
export const studySettingsOptions = queryOptions({
  queryKey: ['study-settings'],
  queryFn: async (): Promise<StudySettings> => {
    const { data, error } = await supabase.from('study_settings').select('exam_date, daily_target').maybeSingle()
    if (error) throw error
    return {
      examDate: data?.exam_date ?? null,
      dailyTarget: data?.daily_target && data.daily_target > 0 ? data.daily_target : DEFAULT_DAILY_TARGET,
    }
  },
})

export function useStudySettings() {
  return useQuery(studySettingsOptions)
}

/** Saves the planner settings (insert the first time, update after that). user_id is filled in by the database. */
export async function saveStudySettings(settings: StudySettings) {
  const { error } = await supabase
    .from('study_settings')
    .upsert({ exam_date: settings.examDate, daily_target: settings.dailyTarget }, { onConflict: 'user_id' })
  if (error) throw error
}

/** Device-only progress keys (unfinished mock exam, milestones already shown). */
const LOCAL_PROGRESS_KEYS = ['projectrmt:mock-exam', 'projectrmt:seen-milestones']
const FLASHCARD_SETTINGS_KEY = 'projectrmt:flashcards'

/**
 * Deletes all of her progress: answers, quiz/mock sessions and flashcard schedule.
 * Keeps her own questions, books, uploads and study settings.
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
