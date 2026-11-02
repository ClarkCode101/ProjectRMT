import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// These come from .env.local (see .env.example). The anon key is meant to be
// public: Row Level Security is what protects the data.
// Never put the service_role key in the frontend.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until .env.local is filled in; the app shows a setup screen instead of crashing. */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  anonKey ?? 'missing-anon-key',
)
