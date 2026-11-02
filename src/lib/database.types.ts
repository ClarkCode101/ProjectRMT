// Hand-written to match supabase/migrations/0001_init.sql.
// Once your Supabase project exists, replace this whole file with the generated one:
//   npx supabase gen types typescript --project-id <your-project-id> > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Table<Row, Required extends keyof Row = never> = {
  Row: Row
  Insert: Partial<Row> & Pick<Row, Required>
  Update: Partial<Row>
  Relationships: []
}

export type QuestionSource = 'builtin' | 'user' | 'upload'
export type VerifyStatus = 'unverified' | 'verified'
export type SessionMode = 'practice' | 'mock' | 'flashcard'

export type Database = {
  public: {
    Tables: {
      subjects: Table<
        { id: number; code: string; name: string; weight: number; sort_order: number | null },
        'code' | 'name' | 'weight'
      >
      topics: Table<{ id: number; subject_id: number; name: string }, 'subject_id' | 'name'>
      uploads: Table<
        {
          id: string
          owner_id: string
          file_name: string
          storage_path: string
          status: string
          question_count: number | null
          created_at: string | null
        },
        'file_name' | 'storage_path'
      >
      questions: Table<
        {
          id: string
          owner_id: string | null
          topic_id: number
          source: QuestionSource
          upload_id: string | null
          stem: string
          choices: Json
          correct_index: number
          explanation: string | null
          image_path: string | null
          difficulty: number | null
          status: VerifyStatus
          normalized_stem: string | null
          stem_hash: string | null
          created_at: string | null
        },
        'topic_id' | 'source' | 'stem' | 'choices' | 'correct_index'
      >
      quiz_sessions: Table<
        {
          id: string
          user_id: string
          mode: SessionMode
          filters: Json | null
          total_items: number | null
          score: number | null
          duration_sec: number | null
          started_at: string | null
          finished_at: string | null
        },
        'mode'
      >
      attempts: Table<
        {
          id: string
          user_id: string
          session_id: string | null
          question_id: string
          selected_index: number | null
          is_correct: boolean
          time_ms: number | null
          created_at: string | null
        },
        'question_id' | 'is_correct'
      >
      review_states: Table<
        {
          user_id: string
          question_id: string
          due: string
          stability: number | null
          difficulty: number | null
          elapsed_days: number | null
          scheduled_days: number | null
          reps: number | null
          lapses: number | null
          state: number | null
          last_review: string | null
        },
        'question_id'
      >
      study_settings: Table<{ user_id: string; exam_date: string | null; daily_target: number | null }>
      encouragements: Table<{ id: number; trigger: string; message: string }, 'trigger' | 'message'>
      reference_items: Table<
        { id: number; subject_id: number | null; title: string; value: string; notes: string | null },
        'title' | 'value'
      >
    }
    Views: {
      topic_performance: {
        Row: { user_id: string; subject_id: number; topic_id: number; attempts: number; accuracy: number }
        Relationships: []
      }
    }
    Functions: {
      find_similar_questions: {
        Args: { p_stem: string; p_threshold?: number }
        Returns: { id: string; stem: string; score: number; exact: boolean }[]
      }
    }
    Enums: {
      question_source: QuestionSource
      verify_status: VerifyStatus
      session_mode: SessionMode
    }
    CompositeTypes: Record<string, never>
  }
}
