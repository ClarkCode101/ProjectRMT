import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Logo } from '@/components/report'

// Public page (no login needed): Google asks for a privacy policy link before "Continue with Google"
// can be opened to everyone. Plain words, and only what the app really does. Update it if that changes.

const UPDATED = 'November 11, 2026'

/** Same faint graph paper as the login page. */
const LIGHT_GRAPH_PAPER = {
  backgroundImage:
    'linear-gradient(rgb(7 71 94 / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(7 71 94 / 0.05) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <main
      className="min-h-dvh bg-background px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]"
      style={LIGHT_GRAPH_PAPER}
    >
      <article className="mx-auto max-w-2xl space-y-6 rounded-2xl border bg-card p-6 leading-relaxed shadow-[0_30px_60px_-30px_rgb(7_71_94/0.5)] md:p-10">
        <header className="space-y-3">
          <Link to="/login" className="inline-flex items-center gap-2.5 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <Logo className="size-9 rounded-lg" />
            <span className="font-heading text-xl font-bold tracking-tight">
              Project<span className="text-primary">RMT</span>
            </span>
          </Link>
          <h1 className="text-3xl font-bold">Privacy policy</h1>
          <p className="text-sm text-muted-foreground">Last updated {UPDATED}</p>
        </header>

        <p>
          ProjectRMT is a small, free, private review app for the Medical Technologist Licensure Exam (MTLE). It is run by
          one admin for a small group of reviewers. There are no ads, and nothing is sold.
        </p>

        <Section title="What we keep">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b>Your account:</b> your email address, and your name and profile picture link if you sign in with Google.
            </li>
            <li>
              <b>Your review:</b> your answers, scores, practice and mock exam sessions, flashcard schedule, study plan, and
              any questions or books you make.
            </li>
            <li>
              <b>What you share:</b> books you publish to the Community shelf, and messages you send in Board Review games.
              Other members can see these.
            </li>
          </ul>
        </Section>

        <Section title="Signing in with Google">
          <p>
            We only ask Google for your email address, name, and profile picture. We never see your Google password, and
            we can’t read your Gmail, Drive, or anything else in your Google account.
          </p>
        </Section>

        <Section title="Where it is stored">
          <p>
            Your data is stored with Supabase, the service that runs the app’s database and sign-in. A copy of your
            questions and recent answers is also kept on your own device so you can practice offline.
          </p>
        </Section>

        <Section title="Who can see it">
          <p>
            Only you can see your own progress. The admin can see the list of accounts (names and emails) to accept new
            members. Books you publish and messages you send in games are visible to other members.
          </p>
          <p>We don’t use analytics or tracking tools, and we don’t share your data with anyone else.</p>
        </Section>

        <Section title="Deleting your data">
          <p>
            You can reset your progress any time in Settings. To delete your whole account and everything in it, message
            the admin and it will be removed.
          </p>
        </Section>

        <p className="border-t pt-5 text-sm text-muted-foreground">
          Questions about this policy? Message the ProjectRMT admin.{' '}
          <Link to="/login" className="font-bold text-primary hover:underline">
            Back to log in
          </Link>
        </p>
      </article>
    </main>
  )
}
