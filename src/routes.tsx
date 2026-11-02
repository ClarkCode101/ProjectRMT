import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from '@/components/AppLayout'
import { FullPageMessage } from '@/components/FullPageMessage'
import { RequireAuth } from '@/features/auth/RequireAuth'

// Each page is its own download (lazy), so the first load stays small on mobile data.
const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
const HomePage = lazy(() => import('@/features/home/HomePage'))
const PracticePage = lazy(() => import('@/features/quiz/PracticePage'))
const MistakesPage = lazy(() => import('@/features/mistakes/MistakesPage'))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const QuestionsPage = lazy(() => import('@/features/questions/QuestionsPage'))
const QuestionEditorPage = lazy(() => import('@/features/questions/QuestionEditorPage'))
const QuestionUploadPage = lazy(() => import('@/features/questions/QuestionUploadPage'))

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<FullPageMessage>Loading…</FullPageMessage>}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    // Everything inside here needs a logged-in user.
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/practice', element: <PracticePage /> },
      { path: '/mistakes', element: <MistakesPage /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/questions', element: <QuestionsPage /> },
      { path: '/questions/new', element: <QuestionEditorPage /> },
      { path: '/questions/upload', element: <QuestionUploadPage /> },
      { path: '/questions/:id/edit', element: <QuestionEditorPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
