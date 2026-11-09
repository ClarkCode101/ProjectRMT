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
/** The spine colors she can pick for a book (migration 0004 checks the same list). */
export type BookColor = 'teal' | 'red' | 'green' | 'gold' | 'purple' | 'slate'

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
          storage_path: string | null // null: the file was read in the browser and not stored (migration 0003)
          status: string
          question_count: number | null
          created_at: string | null
        },
        'file_name'
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
          /** one note per choice, same order as choices; null = no notes (migration 0008) */
          choice_notes: Json | null
          image_path: string | null
          difficulty: number | null
          status: VerifyStatus
          /** false = lives only in her book (migration 0006): not in its subject's lists, scores or quizzes */
          in_subject: boolean
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
      // migration 0004: her own books (named collections of questions, like playlists)
      // published_at, copied_from: migration 0010 (Community). The app can't write these two directly;
      // publish_book and add_community_book set them. (0010's author_name was removed in 0011: the name is read live.)
      books: Table<
        {
          id: string
          owner_id: string
          title: string
          color: BookColor
          library: number
          created_at: string
          /** when it was shared to Community; null = private */
          published_at: string | null
          /** the shared book this is a copy of; null = her own book (or the original was deleted) */
          copied_from: string | null
          /** the account that shared the original (migration 0015); kept even if the original is deleted */
          copied_author: string | null
        },
        'title'
      >
      libraries: Table<{ owner_id: string; slot: number; name: string }, 'slot' | 'name'>
      // chapter: migration 0005 (her own name for a group of questions inside the book; null = none)
      book_questions: Table<{ book_id: string; question_id: string; added_at: string; chapter: string | null }, 'book_id' | 'question_id'>
      // migration 0009: her own changes to a built-in question (other accounts don't see them)
      question_overrides: Table<
        {
          user_id: string
          question_id: string
          /** topic_id, stem, choices and correct_index are all null when she only changed the status */
          topic_id: number | null
          stem: string | null
          choices: Json | null
          correct_index: number | null
          explanation: string | null
          choice_notes: Json | null
          difficulty: number | null
          /** null = same status as the built-in question */
          status: VerifyStatus | null
          updated_at: string
        },
        'question_id'
      >
    }
    Views: {
      /** migration 0009: every question she can see, with her own changes to built-in ones on top. Read from this. */
      my_questions: {
        Row: {
          id: string
          owner_id: string | null
          source: QuestionSource
          upload_id: string | null
          image_path: string | null
          in_subject: boolean
          created_at: string | null
          topic_id: number
          stem: string
          choices: Json
          correct_index: number
          explanation: string | null
          choice_notes: Json | null
          difficulty: number | null
          status: VerifyStatus
          /** true = she edited this built-in question */
          edited: boolean
        }
        Relationships: []
      }
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
      // migration 0010: the Community shelf
      publish_book: {
        Args: { p_book_id: string; p_publish: boolean }
        Returns: undefined
      }
      community_books: {
        Args: Record<string, never>
        Returns: {
          id: string
          title: string
          color: BookColor
          /** the author's first name from their account right now (migration 0011); "A classmate" if none */
          author_name: string
          published_at: string
          question_count: number
          subject_codes: string[]
          times_added: number
          is_mine: boolean
          my_copy_id: string | null
        }[]
      }
      community_book_preview: {
        Args: { p_book_id: string; p_limit?: number }
        Returns: { question_id: string; stem: string; subject_code: string; chapter: string | null }[]
      }
      add_community_book: {
        Args: { p_book_id: string; p_library: number }
        Returns: string
      }
      // migration 0012: move every question of one book into another under one topic, then delete the first
      merge_books: {
        Args: { p_source: string; p_target: string; p_chapter: string }
        Returns: number
      }
      // migration 0015: the author's first name for each of her books copied from Community (read live)
      my_book_authors: {
        Args: Record<string, never>
        Returns: { book_id: string; author_name: string }[]
      }
      // migration 0013: delete a book and her questions that lived only in it
      delete_book: {
        Args: { p_book_id: string }
        Returns: number
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
