import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// These come from .env.local (see .env.example). The publishable key is meant
// to be public: Row Level Security is what protects the data.
// Never put the secret / service_role key in the frontend.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Names of the settings that are missing from this build (shown on the setup screen). */
export const missingEnvVars = [
  !url && 'VITE_SUPABASE_URL',
  !publishableKey && 'VITE_SUPABASE_PUBLISHABLE_KEY',
].filter((name): name is string => Boolean(name))

/** False until the settings are filled in; the app shows a setup screen instead of crashing. */
export const isSupabaseConfigured = missingEnvVars.length === 0

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  publishableKey ?? 'missing-publishable-key',
)
