import { BadgeCheck, ChevronDown, CircleCheck, CircleX, Pencil, Plus, Search, Trash2, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { headerButtonClass, PageHeader } from '@/components/dashboard'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { filterQuestions, summarizeCoverage, type BankFilters, type CoverageLevel, type SubjectCoverage } from '@/lib/questions'
import { useSubjectOfTopic, useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { deleteQuestion, setQuestionStatus, useQuestionBank, useRefreshBank, type BankQuestion } from './api'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
// Long lists are slow on phones, so show them in batches.
const BATCH = 30

const focusRing = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/40'

export default function QuestionsPage() {
  const bank = useQuestionBank()
  const subjects = useSubjects()
  const topics = useTopics()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'coverage' ? 'coverage' : 'list'
  // Set by the search box in the top bar.
  const initialSearch = searchParams.get('search') ?? ''
  // Set by the editor after a save, so we can say it worked.
  const saved = (useLocation().state as { saved?: 'added' | 'updated' } | null)?.saved

  if (bank.isPending || subjects.isPending || topics.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (bank.isError || subjects.isError || topics.isError) {
    return <FullPageMessage>Couldn’t load the questions. Check your internet connection, then refresh.</FullPageMessage>
  }

  const toVerify = bank.data.filter((q) => q.status === 'unverified').length

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Questions"
        subtitle={`${bank.data.length} questions, ${toVerify} not yet verified.`}
        actions={
          <Link to="/questions/new" className={headerButtonClass}>
            <Plus className="size-4" aria-hidden />
            Add question
          </Link>
        }
      />

      {saved && (
        <p role="status" className="flex items-center gap-2 rounded-md bg-correct-soft px-3 py-2 font-semibold text-correct">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          {saved === 'added' ? 'Question added.' : 'Changes saved.'}
        </p>
      )}

      {/* Two views of the same bank. The view is kept in the address (?view=coverage) so Back works. */}
      <div role="group" aria-label="View" className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1 sm:inline-grid sm:w-80">
        <ViewLink active={view === 'list'} onClick={() => setSearchParams({})}>
          All questions
        </ViewLink>
        <ViewLink active={view === 'coverage'} onClick={() => setSearchParams({ view: 'coverage' })}>
          Coverage
        </ViewLink>
      </div>

      {view === 'list' ? (
        // key: a new search from the top bar starts a fresh list.
        <QuestionList key={initialSearch} initialSearch={initialSearch} questions={bank.data} subjects={subjects.data} topics={topics.data} />
      ) : (
        <CoverageView coverage={summarizeCoverage(bank.data, subjects.data, topics.data)} />
      )}
    </div>
  )
}

function ViewLink({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('h-10 rounded-md text-sm font-semibold', focusRing, active ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}
    >
      {children}
    </button>
  )
}

// ---------- All questions ----------

function QuestionList({
  initialSearch,
  questions,
  subjects,
  topics,
}: {
  initialSearch: string
  questions: BankQuestion[]
  subjects: { id: number; code: string }[]
  topics: { id: number; subject_id: number }[]
}) {
  const [search, setSearch] = useState(initialSearch)
  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [status, setStatus] = useState<BankFilters['status']>('all')
  const [source, setSource] = useState<BankFilters['source']>('all')
  const [shownCount, setShownCount] = useState(BATCH)

  const subjectTopicIds = subjectId === null ? null : topics.filter((t) => t.subject_id === subjectId).map((t) => t.id)
  const shown = filterQuestions(questions, { search, subjectTopicIds, status, source })

  // Any filter change starts the list from the top again.
  function onFilter<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value)
      setShownCount(BATCH)
    }
  }

  return (
    <section aria-label="All questions" className="space-y-3">
      <div className="space-y-2">
        <div className="relative">
          <Label htmlFor="q-search" className="sr-only">
            Search questions
          </Label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            id="q-search"
            type="search"
            placeholder="Search questions and choices"
            value={search}
            onChange={(e) => onFilter(setSearch)(e.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-card pr-3 pl-9 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FilterSelect id="q-subject" label="Subject" value={subjectId ?? ''} onChange={(v) => onFilter(setSubjectId)(v ? Number(v) : null)}>
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id="q-status" label="Status" value={status} onChange={(v) => onFilter(setStatus)(v as BankFilters['status'])}>
            <option value="all">Any status</option>
            <option value="unverified">To verify</option>
            <option value="verified">Verified</option>
          </FilterSelect>
          <FilterSelect id="q-source" label="Source" value={source} onChange={(v) => onFilter(setSource)(v as BankFilters['source'])}>
            <option value="all">Any source</option>
            <option value="builtin">Built-in</option>
            <option value="mine">Mine</option>
          </FilterSelect>
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {shown.length === questions.length ? `${shown.length} questions` : `${shown.length} of ${questions.length} questions match`}
      </p>

      {shown.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-8 text-center text-muted-foreground">No questions match. Try a different search or filter.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {shown.slice(0, shownCount).map((q) => (
            <QuestionRow key={q.id} question={q} />
          ))}
        </ul>
      )}

      {shown.length > shownCount && (
        <Button variant="outline" className="h-11 w-full rounded-lg" onClick={() => setShownCount((n) => n + BATCH)}>
          Show more ({shown.length - shownCount} left)
        </Button>
      )}
    </section>
  )
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string
  label: string
  value: string | number
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <div>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} className="bg-card px-2 text-sm sm:px-3">
        {children}
      </NativeSelect>
    </div>
  )
}

/** One question. Closed: subject, status and the question. Open: choices, explanation, and actions. */
function QuestionRow({ question: q }: { question: BankQuestion }) {
  const subjectOf = useSubjectOfTopic()
  const refresh = useRefreshBank()
  const subject = subjectOf(q.topic_id)
  const isMine = q.owner_id !== null
  const verified = q.status === 'verified'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      refresh()
    } catch {
      setError('Couldn’t save. Check your internet connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 outline-none hover:bg-secondary/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>
                <span className="font-heading font-bold text-foreground">{subject.code ?? '—'}</span> {subject.topicName}
              </span>
              {verified ? (
                <span className="inline-flex items-center gap-1 font-semibold text-correct">
                  <BadgeCheck className="size-3.5" aria-hidden />
                  Verified
                </span>
              ) : (
                <span className="rounded-full bg-highlight-soft px-2 py-px font-semibold text-foreground">To verify</span>
              )}
              {isMine && <span className="rounded-full bg-secondary px-2 py-px font-semibold text-foreground">Mine</span>}
            </span>
            <span className="mt-0.5 block leading-snug font-semibold">{q.stem}</span>
          </span>
          <ChevronDown className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>

        <div className="space-y-3 px-4 pb-4 sm:px-5">
          <ol className="grid gap-1.5 text-sm" aria-label="Choices">
            {q.choices.map((choice, i) => {
              const correct = i === q.correct_index
              return (
                <li key={i} className={cn('flex gap-2 rounded-md px-3 py-2', correct ? 'bg-correct-soft font-bold text-correct' : 'bg-background')}>
                  <span className="w-4 shrink-0 font-heading font-bold">{LETTERS[i]}</span>
                  <span className="min-w-0 flex-1">{choice}</span>
                  {correct && <span className="shrink-0 text-xs">Correct</span>}
                </li>
              )
            })}
          </ol>
          {q.explanation ? (
            <p className="leading-relaxed text-foreground/90">{q.explanation}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No explanation yet.</p>
          )}

          {error && (
            <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              className={cn('h-10 rounded-lg', verified && 'bg-card text-foreground ring-1 ring-border hover:bg-secondary')}
              disabled={busy}
              onClick={() => run(() => setQuestionStatus(q.id, verified ? 'unverified' : 'verified'))}
            >
              <BadgeCheck className="size-4" aria-hidden />
              {verified ? 'Mark as not verified' : 'Mark as verified'}
            </Button>
            <Link
              to={`/questions/${q.id}/edit`}
              className={cn('inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:border-primary', focusRing)}
            >
              <Pencil className="size-4" aria-hidden />
              Edit
            </Link>
            {isMine && (
              <Button variant="ghost" className="h-10 rounded-lg text-wrong hover:bg-wrong-soft hover:text-wrong" disabled={busy} onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" aria-hidden />
                Delete
              </Button>
            )}
          </div>
        </div>
      </details>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} labelledBy={`delete-${q.id}`}>
        <div className="space-y-4">
          <div>
            <h2 id={`delete-${q.id}`} className="text-xl font-bold">
              Delete this question?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              It will be removed from practice, and your past answers to it are deleted too. This can’t be undone.
            </p>
          </div>
          {/* "Keep" comes first so it gets the focus when the dialog opens. */}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="outline" className="h-11 flex-1 rounded-lg" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              className="h-11 flex-1 rounded-lg bg-wrong text-white hover:bg-wrong/90"
              onClick={() => {
                setConfirmDelete(false)
                void run(() => deleteQuestion(q.id))
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </li>
  )
}

// ---------- Coverage ----------

const LEVEL_INFO: Record<CoverageLevel, { label: string; icon: typeof CircleCheck; className: string }> = {
  none: { label: 'None', icon: CircleX, className: 'text-wrong' },
  few: { label: 'Few', icon: TriangleAlert, className: 'text-[#9A5B00]' },
  enough: { label: 'Enough', icon: CircleCheck, className: 'text-correct' },
}

function LevelIcon({ level }: { level: CoverageLevel }) {
  const { icon: Icon, className, label } = LEVEL_INFO[level]
  return <Icon className={cn('size-4 shrink-0', className)} aria-label={label} />
}

function CoverageView({ coverage }: { coverage: SubjectCoverage[] }) {
  return (
    <section aria-labelledby="coverage-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="coverage-heading" className="text-lg font-bold">
          Questions per topic
        </h2>
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <LevelIcon level="enough" /> 10 or more
          </span>
          <span className="inline-flex items-center gap-1">
            <LevelIcon level="few" /> 1 to 9
          </span>
          <span className="inline-flex items-center gap-1">
            <LevelIcon level="none" /> none
          </span>
        </p>
      </div>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {coverage.map((s) => (
          <CoverageRow key={s.subjectId} subject={s} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Tap a subject to see its topics. Topics with the fewest questions are listed first.</p>
    </section>
  )
}

function CoverageRow({ subject }: { subject: SubjectCoverage }) {
  const none = subject.topics.filter((t) => t.level === 'none').length
  const few = subject.topics.filter((t) => t.level === 'few').length
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 outline-none hover:bg-secondary/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="shrink-0 font-heading text-lg font-bold">{subject.code}</span>
            <span className="truncate text-sm text-muted-foreground">{subject.name}</span>
          </span>
          <span className="flex shrink-0 items-center gap-3 text-sm tabular-nums">
            {none > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-wrong">
                <CircleX className="size-4" aria-hidden />
                {none}
                <span className="sr-only">{none === 1 ? 'topic with no questions' : 'topics with no questions'}</span>
              </span>
            )}
            {few > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-[#9A5B00]">
                <TriangleAlert className="size-4" aria-hidden />
                {few}
                <span className="sr-only">{few === 1 ? 'topic with few questions' : 'topics with few questions'}</span>
              </span>
            )}
            <span className="font-heading text-lg font-bold">{subject.total}</span>
          </span>
          <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>

        <ul className="grid gap-x-6 bg-background/60 px-4 py-2 sm:px-5 md:grid-cols-2" aria-label={`${subject.name} topics`}>
          {subject.topics.map((t) => (
            <li key={t.topicId} className="flex min-h-11 items-center gap-2.5 border-b border-border/60 py-1.5 text-sm last:border-0 md:[&:nth-last-child(2):nth-child(odd)]:border-0">
              <LevelIcon level={t.level} />
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              <span className="font-semibold tabular-nums">{t.count}</span>
              <Link
                to={`/questions/new?topic=${t.topicId}`}
                aria-label={`Add a question to ${t.name}`}
                title="Add a question"
                className={cn('flex size-8 items-center justify-center rounded-md text-primary hover:bg-primary/10', focusRing)}
              >
                <Plus className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </li>
  )
}
