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
/** 'board' = one Board Review game (migration 0022); 'cards' = one Last Card game (migration 0041) */
export type SessionMode = 'practice' | 'mock' | 'flashcard' | 'board' | 'cards'
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
      // migration 0036: the admin's notice at the top of a page (read-only here; the admin writes through set_notice)
      notices: Table<{ place: 'questions' | 'home'; body: string; posted_at: string }, 'place' | 'body'>
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
          /** copied from Community and not edited since: who wrote it, and from which shared book (migration 0016) */
          copied_author: string | null
          copied_from_book: string | null
          /** her own topic for it inside its subject, e.g. "Ewan" (migration 0019); null = just its board topic */
          subject_topic: string | null
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
          /** a Board Review lifeline helped: left out of the scores (migration 0032) */
          assisted: boolean
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
          /** her own topic for it inside its subject (migration 0019) */
          subject_topic: string | null
        }
        Relationships: []
      }
      topic_performance: {
        Row: { user_id: string; subject_id: number; topic_id: number; attempts: number; accuracy: number }
        Relationships: []
      }
    }
    Functions: {
      // migration 0033: access requests (Google sign-in, then the admin accepts)
      my_access: {
        Args: Record<string, never>
        /** { status, is_admin, requested_at }; read it with parseAccess (lib/access.ts) */
        Returns: unknown
      }
      list_members: {
        Args: Record<string, never>
        Returns: {
          user_id: string
          email: string
          name: string | null
          /** how they sign in: 'google', 'email' (migration 0034) */
          providers: string[]
          status: 'pending' | 'approved' | 'declined'
          is_admin: boolean
          requested_at: string
          /** when they last studied; null = never (migration 0037; missing before it runs) */
          last_active_at?: string | null
        }[]
      }
      // migration 0038: temporary password from the admin
      admin_reset_password: {
        Args: { p_user: string; p_password: string }
        Returns: undefined
      }
      finish_password_change: {
        Args: Record<string, never>
        Returns: undefined
      }
      // migration 0036: the admin's notices
      set_notice: {
        Args: { p_place: 'questions' | 'home'; p_body: string }
        Returns: undefined
      }
      clear_notice: {
        Args: { p_place: 'questions' | 'home' }
        Returns: undefined
      }
      // migration 0035: delete a declined account for good
      delete_member: {
        Args: { p_user: string }
        Returns: undefined
      }
      // migration 0040: phone notifications for the admin
      save_push_subscription: {
        Args: { p_endpoint: string; p_p256dh: string; p_auth: string }
        Returns: undefined
      }
      delete_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      has_push_subscription: {
        Args: { p_endpoint: string }
        Returns: boolean
      }
      send_test_push: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      set_member_access: {
        Args: { p_user: string; p_status: 'approved' | 'declined' }
        Returns: undefined
      }
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
      // migration 0020: every question's text in a shared book, for the duplicate check before adding it
      community_book_stems: {
        Args: { p_book_id: string }
        Returns: { question_id: string; stem: string }[]
      }
      add_community_book: {
        // p_skip: migration 0021, the questions she already has and chose to leave out
        Args: { p_book_id: string; p_library: number; p_skip?: string[] }
        Returns: string
      }
      // migration 0012: move every question of one book into another under one topic, then delete the first
      merge_books: {
        // p_skip: migration 0017, the incoming duplicates she chose to skip
        Args: { p_source: string; p_target: string; p_chapter: string; p_skip?: string[] }
        Returns: number
      }
      // migration 0019: merge one of her books into a subject, and her topics inside subjects
      merge_into_subject: {
        Args: { p_source: string; p_subject_id: number; p_topic: string; p_skip?: string[] }
        Returns: number
      }
      rename_subject_topic: {
        Args: { p_subject_id: number; p_old: string; p_new: string }
        Returns: number
      }
      split_subject_topic: {
        Args: { p_subject_id: number; p_topic: string; p_library: number }
        Returns: string
      }
      // migration 0018: rename a topic in one of her books (every question under it); returns how many
      rename_topic: {
        Args: { p_book_id: string; p_old: string; p_new: string }
        Returns: number
      }
      // migration 0016: a topic in one of her books becomes its own book; returns the new book's id
      split_topic: {
        Args: { p_book_id: string; p_chapter: string; p_library: number }
        Returns: string
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
      // migration 0023: Board Review team games (lib/boardTeam.ts reads board_room_state)
      board_classmates: { Args: Record<string, never>; Returns: { user_id: string; name: string }[] }
      board_create_room: { Args: Record<string, never>; Returns: string }
      board_invite: { Args: { p_room: string; p_to: string }; Returns: undefined }
      board_my_invites: {
        Args: Record<string, never>
        Returns: { invite_id: string; room_id: string; from_name: string; players: number; created_at: string }[]
      }
      board_respond_invite: { Args: { p_invite: string; p_accept: boolean }; Returns: string | null }
      board_join: { Args: { p_code: string }; Returns: string }
      board_my_room: { Args: Record<string, never>; Returns: { room_id: string; status: string; my_turn: boolean; players: number }[] }
      board_leave: { Args: { p_room: string }; Returns: undefined }
      board_kick: { Args: { p_room: string; p_user: string }; Returns: undefined }
      board_start: { Args: { p_room: string }; Returns: undefined }
      board_roll: { Args: { p_room: string }; Returns: number }
      board_answer: { Args: { p_room: string; p_selected: number }; Returns: boolean }
      board_skip: { Args: { p_room: string }; Returns: undefined }
      board_room_state: { Args: { p_room: string }; Returns: Json }
      // migration 0032: lifelines (Rule out 2, Second chance, Snake shield)
      board_use_lifeline: { Args: { p_room: string; p_lifeline: string }; Returns: undefined }
      // migration 0024: Play again from the finish screen
      board_rematch: { Args: { p_room: string }; Returns: string }
      // migration 0025: Back to Board Review on the finish screen = not playing again
      board_rematch_done: { Args: { p_room: string }; Returns: undefined }
      // migrations 0026–0027: dev testing only (a dev key from .env.local, or test accounts in board_dev_testers)
      board_dev_finish: { Args: { p_room: string; p_key?: string | null }; Returns: undefined }
      // migration 0029: room chat (messages clear after 5 hours)
      board_room_messages: {
        Args: { p_room: string }
        Returns: { id: string; user_id: string; name: string; body: string; created_at: string }[]
      }
      board_send_message: { Args: { p_room: string; p_body: string }; Returns: string }
      board_delete_message: { Args: { p_message: string }; Returns: undefined }
      // migration 0030: her answers in one team game, per subject (finish screen)
      board_my_game_answers: {
        Args: { p_room: string }
        Returns: { subject_code: string; answered: number; correct: number }[]
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
