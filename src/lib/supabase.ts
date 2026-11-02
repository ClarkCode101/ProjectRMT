import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// These come from .env.local (see .env.example). The publishable key is meant
// to be public: Row Level Security is what protects the data.
// Never put the secret / service_role key in the frontend.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** False until .env.local is filled in; the app shows a setup screen instead of crashing. */
export const isSupabaseConfigured = Boolean(url && publishableKey)

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  publishableKey ?? 'missing-publishable-key',
)
