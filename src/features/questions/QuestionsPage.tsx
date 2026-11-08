import { BadgeCheck, Check, ChevronDown, CircleCheck, Flag, Library, Pencil, Plus, Search, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/dashboard'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { NativeSelect } from '@/components/NativeSelect'
import { heroButtonClass } from '@/components/report'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { filterQuestions, summarizeCoverage, type BankFilters } from '@/lib/questions'
import { useSubjectOfTopic, useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { deleteQuestion, setQuestionStatus, useQuestionBank, useRefreshBank, type BankQuestion } from './api'
import { ArchiveCabinet } from './ArchiveCabinet'
import { DrawerBar } from './DrawerBar'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
// Long lists are slow on phones, so show them in batches.
const BATCH = 30

const focusRing = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/40'

/** The small tinted buttons on the cabinet screen (same as the ones under the rack on Practice). */
const smallButtonClass =
  'flex h-10 items-center justify-center gap-2 rounded-lg bg-primary/[0.08] px-4 text-sm font-bold text-primary outline-none transition-colors hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px'

export default function QuestionsPage() {
  const bank = useQuestionBank()
  const subjects = useSubjects()
  const topics = useTopics()

  if (bank.isPending || subjects.isPending || topics.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (bank.isError || subjects.isError || topics.isError) {
    return <FullPageMessage>Couldn’t load the questions. Check your internet connection, then refresh.</FullPageMessage>
  }

  return <QuestionBankView questions={bank.data} subjects={subjects.data} topics={topics.data} />
}

/**
 * Two screens, one job each, so she always knows where she is:
 * - /questions: the cabinet, to choose where to go (or search, or add).
 * - /questions?subject=ID, ?topic=ID or ?view=all: a list, with DrawerBar stuck on top.
 * Everything she filtered by is kept in the address, so Back and coming back from the editor just work.
 */
function QuestionBankView({
  questions,
  subjects,
  topics,
}: {
  questions: BankQuestion[]
  subjects: { id: number; code: string; name: string }[]
  topics: { id: number; subject_id: number; name: string }[]
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  // Set by the editor after a save, so we can say it worked.
  const saved = (useLocation().state as { saved?: 'added' | 'updated' } | null)?.saved

  const topic = topics.find((t) => t.id === Number(searchParams.get('topic'))) ?? null
  const subjectParam = subjects.find((s) => s.id === Number(searchParams.get('subject')))?.id ?? null
  const subjectId = topic?.subject_id ?? subjectParam
  const search = searchParams.get('q') ?? ''
  const onlyNeedsLook = searchParams.get('needs') === '1'
  const atCabinet = subjectId === null && searchParams.get('view') !== 'all'

  const [source, setSource] = useState<BankFilters['source']>('all')
  const [optionsOpen, setOptionsOpen] = useState(false)

  const coverage = summarizeCoverage(questions, subjects, topics)
  const subject = coverage.find((s) => s.subjectId === subjectId)

  // Questions are ready to use by default (the built-in set is fact-checked; ones she types are hers).
  // Only two kinds "need a look": uploads not checked yet, and ones she reported from a quiz.
  const needsLook = questions.filter((q) => q.status === 'unverified')
  const subjectOfTopic = new Map(topics.map((t) => [t.id, t.subject_id]))
  const flaggedBySubject = new Map<number, number>()
  for (const q of needsLook) {
    const id = subjectOfTopic.get(q.topic_id)
    if (id !== undefined) flaggedBySubject.set(id, (flaggedBySubject.get(id) ?? 0) + 1)
  }

  const subjectTopicIds = topic ? [topic.id] : subject ? subject.topics.map((t) => t.topicId) : null
  const filters: BankFilters = { search, subjectTopicIds, status: 'all', source }
  const needsLookInScope = filterQuestions(questions, { ...filters, status: 'unverified' })
  const shown = onlyNeedsLook ? needsLookInScope : filterQuestions(questions, filters)
  // How many are in this drawer or folder before searching, for "3 of 30 questions match".
  const scopeTotal = filterQuestions(questions, { search: '', subjectTopicIds, status: 'all', source: 'all' }).length

  const scope: Record<string, string> = topic ? { topic: String(topic.id) } : subject ? { subject: String(subject.subjectId) } : { view: 'all' }
  const addTo = topic ? `/questions/new?topic=${topic.id}` : '/questions/new'
  const addLabel = topic ? `Add to ${topic.name}` : 'Add question'

  /** The address for this list with the search and "needs a look" kept. */
  function listParams(where: Record<string, string>, change: { search?: string; needs?: boolean } = {}) {
    const nextSearch = change.search ?? search
    const nextNeeds = change.needs ?? onlyNeedsLook
    return { ...where, ...(nextSearch && { q: nextSearch }), ...(nextNeeds && { needs: '1' }) }
  }

  function updateList(change: { search?: string; needs?: boolean }) {
    // The first letter typed at the cabinet moves to the list (a real step, so Back returns to the cabinet).
    // After that, typing shouldn't fill up the Back button's history.
    setSearchParams(listParams(scope, change), { replace: !atCabinet })
  }

  function selectTopic(id: number | null) {
    setSearchParams(listParams(id === null ? { subject: String(subjectId) } : { topic: String(id) }), { replace: true })
    window.scrollTo({ top: 0 })
  }

  const placeholder = atCabinet ? 'Search all questions' : `Search in ${topic?.name ?? subject?.code ?? 'all questions'}`

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {atCabinet ? (
        <>
          <PageHeader title="Questions" subtitle={`${questions.length} questions${needsLook.length > 0 ? ` · ${needsLook.length} need a look` : ''}.`} />
          <ArchiveCabinet coverage={coverage} flaggedBySubject={flaggedBySubject} />
          {/* Add: the gold button, centered under the scene like Start on the other pages. */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link to={addTo} className={cn(heroButtonClass, 'w-auto max-w-full px-7 focus-visible:ring-ring/50')}>
              <Plus className="size-5 shrink-0" aria-hidden />
              {addLabel}
            </Link>
            <Link to="/questions/upload" className={cn(smallButtonClass, 'h-12')}>
              <Upload className="size-4" aria-hidden />
              Upload
            </Link>
          </div>
        </>
      ) : (
        <DrawerBar
          title={subject?.code ?? 'All questions'}
          subtitle={subject?.name}
          count={scopeTotal}
          addTo={addTo}
          addLabel={addLabel}
          subject={subject}
          topicId={topic?.id ?? null}
          onSelectTopic={selectTopic}
        />
      )}

      {saved && (
        <p role="status" className="flex items-center gap-2 rounded-md bg-correct-soft px-3 py-2 font-semibold text-correct">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          {saved === 'added' ? 'Question added.' : 'Changes saved.'}
        </p>
      )}

      {/* The search box stays the same element on both screens, so typing at the cabinet keeps the keyboard open. */}
      <section aria-label="Find questions" className={cn('space-y-3', atCabinet && 'mx-auto max-w-xl border-t border-dashed pt-4')}>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Label htmlFor="q-search" className="sr-only">
              Search questions
            </Label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="q-search"
              type="search"
              placeholder={placeholder}
              value={search}
              onChange={(e) => updateList({ search: e.target.value })}
              className="h-11 w-full rounded-lg border border-input bg-card pr-3 pl-9 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          {!atCabinet && (
            <button
              type="button"
              onClick={() => setOptionsOpen(true)}
              aria-label={source !== 'all' ? 'Filter options (changed)' : 'Filter options'}
              className={cn('relative flex size-11 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground', focusRing)}
            >
              <SlidersHorizontal className="size-5" aria-hidden />
              {source !== 'all' && <span className="absolute top-2 right-2 size-2 rounded-full bg-highlight" aria-hidden />}
            </button>
          )}
        </div>

        {atCabinet ? (
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/questions?view=all" className={smallButtonClass}>
              <Library className="size-4" aria-hidden />
              Browse all <span className="tabular-nums">{questions.length}</span>
            </Link>
            {needsLook.length > 0 && (
              <Link to="/questions?view=all&needs=1" className={cn(smallButtonClass, 'bg-highlight-soft text-foreground hover:bg-highlight-soft hover:brightness-95')}>
                <Flag className="size-3.5" aria-hidden />
                Needs a look <span className="tabular-nums">{needsLook.length}</span>
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {shown.length === scopeTotal ? questionCount(shown.length) : `${shown.length} of ${questionCount(scopeTotal)} match`}
              </p>
              {/* Only there when there's something to look at (or to turn back off), so most days it's out of the way. */}
              {(needsLookInScope.length > 0 || onlyNeedsLook) && (
                <button
                  type="button"
                  onClick={() => updateList({ needs: !onlyNeedsLook })}
                  aria-pressed={onlyNeedsLook}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition-colors',
                    focusRing,
                    onlyNeedsLook ? 'bg-primary text-white' : 'bg-highlight-soft text-foreground hover:brightness-95',
                  )}
                >
                  {onlyNeedsLook ? <Check className="size-4" aria-hidden /> : <Flag className="size-3.5" aria-hidden />}
                  Needs a look · <span className="tabular-nums">{needsLookInScope.length}</span>
                </button>
              )}
            </div>

            {shown.length === 0 ? (
              <p className="rounded-xl border bg-card px-4 py-8 text-center text-muted-foreground">
                {topic && scopeTotal === 0 ? `Nothing filed under ${topic.name} yet. Add the first one.` : 'No questions match. Try a different search or filter.'}
              </p>
            ) : (
              // key: a different list starts from its first batch again.
              <QuestionList key={JSON.stringify([scope, search, onlyNeedsLook, source])} questions={shown} />
            )}
          </>
        )}
      </section>

      <Dialog open={optionsOpen} onClose={() => setOptionsOpen(false)} labelledBy="q-options-heading" variant="sheet">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="q-options-heading" className="font-heading text-lg font-bold">
              Filter options
            </h2>
            <button
              type="button"
              onClick={() => setOptionsOpen(false)}
              aria-label="Close"
              className={cn('flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground', focusRing)}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div>
            <Label htmlFor="q-source" className="mb-1.5 block text-sm font-semibold">
              Source
            </Label>
            <NativeSelect id="q-source" value={source} onChange={(e) => setSource(e.target.value as BankFilters['source'])} className="bg-card">
              <option value="all">Any source</option>
              <option value="builtin">Built-in</option>
              <option value="mine">Mine</option>
            </NativeSelect>
          </div>
          <button
            type="button"
            onClick={() => setOptionsOpen(false)}
            className={cn('h-11 w-full rounded-lg bg-primary font-heading font-bold text-primary-foreground hover:bg-primary/90', focusRing)}
          >
            Done
          </button>
        </div>
      </Dialog>
    </div>
  )
}

function questionCount(n: number) {
  return `${n} question${n === 1 ? '' : 's'}`
}

function QuestionList({ questions }: { questions: BankQuestion[] }) {
  const [shownCount, setShownCount] = useState(BATCH)
  return (
    <>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {questions.slice(0, shownCount).map((q) => (
          <QuestionRow key={q.id} question={q} />
        ))}
      </ul>
      {questions.length > shownCount && (
        <Button variant="outline" className="h-11 w-full rounded-lg" onClick={() => setShownCount((n) => n + BATCH)}>
          Show more ({questions.length - shownCount} left)
        </Button>
      )}
    </>
  )
}

/** One question. Closed: subject, status and the question. Open: choices, explanation, and actions. */
function QuestionRow({ question: q }: { question: BankQuestion }) {
  const subjectOf = useSubjectOfTopic()
  const refresh = useRefreshBank()
  const subject = subjectOf(q.topic_id)
  const isMine = q.owner_id !== null
  const verified = q.status === 'verified'
  // An unchecked upload "needs a look"; anything else that isn't verified was reported from a quiz.
  const needsLookLabel = q.source === 'upload' ? 'Needs a look' : 'Reported'
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
              {/* No badge when it's fine (most of them), so the few that need a look stand out. */}
              {!verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-highlight-soft px-2 py-px font-semibold text-foreground">
                  {needsLookLabel === 'Reported' && <Flag className="size-3" aria-hidden />}
                  {needsLookLabel}
                </span>
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
            {verified ? (
              // Quiet: most questions are fine; this is only for when she spots a problem here.
              <Button variant="outline" className="h-10 rounded-lg" disabled={busy} onClick={() => run(() => setQuestionStatus(q.id, 'unverified'))}>
                <Flag className="size-4" aria-hidden />
                Report a problem
              </Button>
            ) : (
              // After fixing it (Edit) or checking it, one tap clears the flag.
              <Button className="h-10 rounded-lg" disabled={busy} onClick={() => run(() => setQuestionStatus(q.id, 'verified'))}>
                <BadgeCheck className="size-4" aria-hidden />
                Looks right now
              </Button>
            )}
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
