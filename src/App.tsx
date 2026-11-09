import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { SetupNotice } from '@/components/SetupNotice'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { isSupabaseConfigured } from '@/lib/supabase'
import { router } from './routes'

const queryClient = new QueryClient({
  defaultOptions: {
    // offlineFirst: still run a query when the device is offline (instead of waiting forever),
    // so it can answer from the copy saved on the device (lib/offline/bank.ts).
    queries: { staleTime: 60 * 1000, retry: 1, networkMode: 'offlineFirst' },
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
