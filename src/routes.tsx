import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from '@/components/AppLayout'
import { FullPageMessage } from '@/components/FullPageMessage'
import { RequireAuth } from '@/features/auth/RequireAuth'

// Each page is its own download (lazy), so the first load stays small on mobile data.
const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
const HomePage = lazy(() => import('@/features/home/HomePage'))
const PracticePage = lazy(() => import('@/features/quiz/PracticePage'))
const MockPage = lazy(() => import('@/features/mock/MockPage'))
const FlashcardsPage = lazy(() => import('@/features/flashcards/FlashcardsPage'))
const BoardPage = lazy(() => import('@/features/board/BoardPage'))
const TeamRoomPage = lazy(() => import('@/features/board/TeamRoomPage'))
const JoinTeamPage = lazy(() => import('@/features/board/JoinTeamPage'))
const ReferencePage = lazy(() => import('@/features/reference/ReferencePage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const QuestionsPage = lazy(() => import('@/features/questions/QuestionsPage'))
const QuestionEditorPage = lazy(() => import('@/features/questions/QuestionEditorPage'))
const QuestionUploadPage = lazy(() => import('@/features/questions/QuestionUploadPage'))
const CommunityPage = lazy(() => import('@/features/community/CommunityPage'))

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
      { path: '/mock', element: <MockPage /> },
      { path: '/flashcards', element: <FlashcardsPage /> },
      { path: '/board', element: <BoardPage /> },
      { path: '/board/team/:roomId', element: <TeamRoomPage /> },
      { path: '/board/join/:code', element: <JoinTeamPage /> },
      { path: '/reference', element: <ReferencePage /> },
      { path: '/settings', element: <SettingsPage /> },
      // The old Review Again list; reviewing mistakes is now a quiz (answer first, then see why).
      { path: '/mistakes', element: <Navigate to="/practice?from=mistakes" replace /> },
      // The old Progress page; its scores now live on Practice (the rack + topic popup).
      { path: '/dashboard', element: <Navigate to="/practice" replace /> },
      { path: '/questions', element: <QuestionsPage /> },
      { path: '/questions/new', element: <QuestionEditorPage /> },
      { path: '/questions/upload', element: <QuestionUploadPage /> },
      { path: '/questions/:id/edit', element: <QuestionEditorPage /> },
      { path: '/community', element: <CommunityPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
