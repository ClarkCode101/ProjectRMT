import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { SetupNotice } from '@/components/SetupNotice'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { isSupabaseConfigured } from '@/lib/supabase'
import { router } from './routes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000, retry: 1 },
  },
})

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  )
}
