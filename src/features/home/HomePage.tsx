import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useMistakes } from '@/features/mistakes/api'
import { cn } from '@/lib/utils'

// Countdown, streak and daily target come in Phase 4 (planner/streak).
export default function HomePage() {
  const mistakes = useMistakes()
  const mistakeCount = mistakes.data?.length ?? 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Hi! Ready mag-review? 👋</h1>
        <p className="text-muted-foreground">Konting tanong araw-araw, malaking tulong sa board exam.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Practice Quiz</CardTitle>
          <CardDescription>Pumili ng subject o topic, may explanation pagkatapos ng bawat sagot.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/practice" className={cn(buttonVariants(), 'h-12 w-full text-base')}>
            Start practice
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review Again</CardTitle>
          <CardDescription>
            {mistakeCount > 0
              ? `${mistakeCount} tanong ang naghihintay na balikan mo.`
              : 'Wala pang mistakes na kailangang balikan.'}
          </CardDescription>
        </CardHeader>
        {mistakeCount > 0 && (
          <CardContent>
            <Link
              to="/practice?from=mistakes"
              className={cn(buttonVariants({ variant: 'outline' }), 'h-12 w-full text-base')}
            >
              Practice my mistakes
            </Link>
          </CardContent>
        )}
      </Card>

      <Link to="/dashboard" className={cn(buttonVariants({ variant: 'ghost' }), 'h-11 w-full text-base')}>
        View weak areas →
      </Link>
    </div>
  )
}
