import { AlertTriangle, Check, ChevronDown, Copy, Plus, Save, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useBlocker } from 'react-router'
import { headerSecondaryClass, PageHeader } from '@/components/dashboard'
import { Dialog } from '@/components/Dialog'
import { NativeSelect } from '@/components/NativeSelect'
import { heroButtonClass } from '@/components/report'
import { Button } from '@/components/ui/button'
import { CHOICE_COUNT } from '@/lib/questions'
import {
  contentErrors,
  itemStatus,
  plannedWrites,
  summarize,
  willSave,
  type Decision,
  type ReviewItem,
  type ReviewStatus,
} from '@/lib/uploadReview'
import { cn } from '@/lib/utils'
import { ChipRadio, CorrectToggle, TopicPicker } from './QuestionFormParts'
import type { Book } from './booksApi'
import { CHAPTER_MAX, chapterList, cleanChapter } from '@/lib/books'
import { saveUpload } from './uploadApi'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const focusRing = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/40'
const fieldClass =
  'w-full rounded-lg border border-input bg-card px-3 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

type Filter = 'all' | 'ready' | 'fix' | 'duplicates'

const STATUS: Record<ReviewStatus, { label: string; className: string }> = {
  ready: { label: 'Ready', className: 'bg-correct-soft text-correct' },
  fix: { label: 'Needs fixing', className: 'bg-wrong-soft text-wrong' },
  duplicate: { label: 'Possible duplicate', className: 'bg-highlight-soft text-[#7A4700]' },
  repeat: { label: 'Repeated in this file', className: 'bg-highlight-soft text-[#7A4700]' },
  checking: { label: 'Checking…', className: 'bg-secondary text-muted-foreground' },
}

/** Where she is in the upload: choose, review, save. Says up front that nothing is saved without a review. */
export function UploadSteps({ current }: { current: 1 | 2 }) {
  const steps = ['Choose', 'Review', 'Save']
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
      {steps.map((step, i) => (
        <li key={step} aria-current={i + 1 === current ? 'step' : undefined} className={cn('flex items-center gap-2', i + 1 === current ? 'text-primary' : 'text-muted-foreground')}>
          {i > 0 && (
            <span aria-hidden className="text-muted-foreground/60">
              →
            </span>
          )}
          <span className={cn('flex size-6 items-center justify-center rounded-full text-xs tabular-nums', i + 1 === current ? 'bg-primary text-white' : 'bg-secondary')}>
            {i + 1 < current ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  )
}

/**
 * Where an upload goes, from where she opened Upload:
 * free = she picks a subject and topic; subject = from a subject's book (only the topic is asked);
 * book = from one of her own books (no subject: they live only in that book, under her own topics there).
 */
export type UploadTarget = { kind: 'free' } | { kind: 'subject'; subjectId: number } | { kind: 'book'; book: Book; topicId: number }

type Props = {
  target: UploadTarget
  fileName: string
  skippedText: string
  items: ReviewItem[]
  onChange: (update: (items: ReviewItem[]) => ReviewItem[]) => void
  checkFailures: number
  subjects: { id: number; code: string; name: string }[]
  topics: { id: number; subject_id: number; name: string }[]
  onStartOver: () => void
  onSaved: (added: number, replaced: number) => void
}

export function UploadReview({ target, fileName, skippedText, items, onChange, checkFailures, subjects, topics, onStartOver, onSaved }: Props) {
  const book = target.kind === 'book' ? target.book : null
  const [subjectId, setSubjectId] = useState<number | null>(target.kind === 'subject' ? target.subjectId : null)
  // Her book: every question goes under the hidden "Your books" topic, so there's nothing to pick there.
  const [topicId, setTopicId] = useState<number | null>(target.kind === 'book' ? target.topicId : null)
  // From a subject's book the subject is set; "Change" opens the full subject + topic picker.
  const [subjectLocked, setSubjectLocked] = useState(target.kind === 'subject')
  // Her book: the topic in the book for the whole upload (her own name, optional); each question can have its own.
  const [uploadChapter, setUploadChapter] = useState('')
  const [typingChapter, setTypingChapter] = useState(false)
  const existingChapters = book ? chapterList(book.chapters).chapters.map((c) => c.name) : []
  const cleanedChapter = cleanChapter(uploadChapter)
  const [filter, setFilter] = useState<Filter>('all')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmStartOver, setConfirmStartOver] = useState(false)

  // Nothing here is saved yet, so leaving (Back, the nav, Start over, closing the tab) asks first.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  function keepReviewing() {
    setConfirmStartOver(false)
    if (blocker.state === 'blocked') blocker.reset()
  }

  function discard() {
    if (blocker.state === 'blocked') blocker.proceed()
    else onStartOver()
  }

  const counts = summarize(items)
  const shown = items.filter((item) => {
    const status = itemStatus(item)
    if (filter === 'ready') return status === 'ready'
    if (filter === 'fix') return status === 'fix'
    if (filter === 'duplicates') return status === 'duplicate' || status === 'repeat'
    return true
  })
  const toWrite = counts.toAdd + counts.toReplace

  function update(key: number, change: (item: ReviewItem) => ReviewItem) {
    onChange((all) => all.map((i) => (i.key === key ? change(i) : i)))
  }

  async function save() {
    if (topicId === null) return
    if ('error' in cleanedChapter) {
      setSaveError(cleanedChapter.error)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveUpload(fileName, plannedWrites(items, topicId, book ? cleanedChapter.chapter : null), book?.id ?? null)
      onSaved(result.added, result.replaced)
    } catch (e) {
      setSaveError(e instanceof Error && e.message.startsWith('Added') ? e.message : 'Couldn’t save. Check your internet connection and try again.')
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-28">
      <PageHeader
        title={`Review ${counts.total} ${counts.total === 1 ? 'question' : 'questions'}`}
        subtitle={`Found in ${fileName}. Nothing is saved until you press Save.`}
        actions={
          <button type="button" onClick={() => setConfirmStartOver(true)} className={headerSecondaryClass}>
            Start over
          </button>
        }
      />

      <UploadSteps current={2} />

      {/* 1. Where they go */}
      {book ? (
        // ---------- Into her own book: no subject; her own topic for all of them (optional), each can have its own ----------
        <section aria-labelledby="topic-heading" className="space-y-3">
          <div>
            <h2 id="topic-heading" className="font-heading text-lg font-bold">
              Topic in your book
            </h2>
            <p className="text-sm text-muted-foreground">
              They go into your book <span className="font-semibold text-foreground">{book.title}</span> only, not into a subject. Optional; you can
              give one question its own topic below.
            </p>
          </div>
          <fieldset className="min-w-0 space-y-2">
            <legend className="sr-only">Topic for all of them</legend>
            {existingChapters.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <ChipRadio
                  name="upload-chapter"
                  checked={!typingChapter && uploadChapter === ''}
                  onChange={() => {
                    setTypingChapter(false)
                    setUploadChapter('')
                  }}
                >
                  None
                </ChipRadio>
                {existingChapters.map((c) => (
                  <ChipRadio
                    key={c}
                    name="upload-chapter"
                    checked={!typingChapter && uploadChapter === c}
                    onChange={() => {
                      setTypingChapter(false)
                      setUploadChapter(c)
                    }}
                  >
                    {c}
                  </ChipRadio>
                ))}
                <ChipRadio
                  name="upload-chapter"
                  checked={typingChapter}
                  onChange={() => {
                    setTypingChapter(true)
                    setUploadChapter('')
                    requestAnimationFrame(() => document.getElementById('upload-chapter')?.focus())
                  }}
                >
                  <Plus className="-ml-0.5 size-4" aria-hidden />
                  New topic
                </ChipRadio>
              </div>
            )}
            {(typingChapter || existingChapters.length === 0) && (
              <>
                <label htmlFor="upload-chapter" className="sr-only">
                  New topic name
                </label>
                <input
                  id="upload-chapter"
                  value={uploadChapter}
                  maxLength={CHAPTER_MAX + 20}
                  placeholder="e.g. Enzymes, or Week 3 drills"
                  onChange={(e) => setUploadChapter(e.target.value)}
                  className={cn(fieldClass, 'h-11')}
                />
              </>
            )}
          </fieldset>
        </section>
      ) : (
        <section aria-labelledby="topic-heading" className="space-y-3">
          <div>
            <h2 id="topic-heading" className="font-heading text-lg font-bold">
              Topic for these questions
            </h2>
            <p className="text-sm text-muted-foreground">Pick one for all of them; you can give one question its own topic below.</p>
          </div>
          {subjectLocked && subjectId !== null ? (
            <>
              {/* From a subject's book: the subject is set, only the topic is asked */}
              <div className="flex items-center justify-between gap-3 rounded-lg border-l-4 border-primary bg-card py-2 pr-1 pl-3">
                <p className="min-w-0 text-sm">
                  Goes into{' '}
                  <span className="font-heading font-bold">
                    {subjects.find((s) => s.id === subjectId)?.code} · {subjects.find((s) => s.id === subjectId)?.name}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setSubjectLocked(false)}
                  aria-label="Change the subject"
                  className="h-9 shrink-0 rounded-md bg-primary/[0.08] px-3 text-sm font-bold text-primary outline-none transition-colors hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  Change
                </button>
              </div>
              <TopicPicker subjects={subjects} topics={topics} subjectId={subjectId} topicId={topicId} showSubjects={false} onSubjectChange={setSubjectId} onTopicChange={setTopicId} />
            </>
          ) : (
            <TopicPicker
              subjects={subjects}
              topics={topics}
              subjectId={subjectId}
              topicId={topicId}
              onSubjectChange={(id) => {
                setSubjectId(id)
                setTopicId(null)
              }}
              onTopicChange={setTopicId}
            />
          )}
        </section>
      )}

      {checkFailures > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-highlight/50 bg-highlight-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          The duplicate check didn’t finish for {checkFailures} {checkFailures === 1 ? 'question' : 'questions'} (internet problem?). They may already be in your bank.
        </p>
      )}

      {/* 2. The questions, with filters */}
      <section aria-labelledby="found-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="found-heading" className="font-heading text-lg font-bold">
            Questions found
          </h2>
          <div role="group" aria-label="Show" className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={counts.total} />
            <FilterChip active={filter === 'ready'} onClick={() => setFilter('ready')} label="Ready" count={counts.ready} />
            <FilterChip active={filter === 'fix'} onClick={() => setFilter('fix')} label="Needs fixing" count={counts.fix} />
            <FilterChip active={filter === 'duplicates'} onClick={() => setFilter('duplicates')} label="Duplicates" count={counts.duplicates} />
          </div>
        </div>
        {counts.checking > 0 && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Checking your bank for duplicates… {items.filter((i) => i.matches !== null).length} of {items.length}
          </p>
        )}

        {shown.length === 0 ? (
          <p className="rounded-xl border bg-card px-4 py-8 text-center text-muted-foreground">Nothing here.</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {shown.map((item) => (
              <ReviewRow
                key={item.key}
                item={item}
                items={items}
                topics={topics}
                subjects={subjects}
                subjectId={subjectId}
                bookChapters={book ? [...new Set([...existingChapters, ...(cleanedChapter && 'chapter' in cleanedChapter && cleanedChapter.chapter ? [cleanedChapter.chapter] : [])])] : null}
                uploadChapter={book && 'chapter' in cleanedChapter ? cleanedChapter.chapter : null}
                onUpdate={(change) => update(item.key, change)}
              />
            ))}
          </ul>
        )}

        {skippedText && (
          <details className="rounded-xl border bg-card text-sm">
            <summary className={cn('cursor-pointer list-none px-4 py-3 text-muted-foreground hover:bg-secondary/50 [&::-webkit-details-marker]:hidden', focusRing)}>
              Text that wasn’t a question ({skippedText.split('\n').length} {skippedText.split('\n').length === 1 ? 'line' : 'lines'})
            </summary>
            <pre className="max-h-60 overflow-auto px-4 pb-4 font-sans text-xs whitespace-pre-wrap text-muted-foreground">{skippedText}</pre>
          </details>
        )}
      </section>

      {/* 3. Save bar, always in reach */}
      <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 px-4 md:bottom-4 md:pl-28">
        <div className="mx-auto flex max-w-4xl flex-col gap-2 rounded-2xl bg-primary-deep p-3 text-white shadow-[0_16px_40px_-16px_rgb(7_71_94/0.8)] sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="text-sm text-white/85" aria-live="polite">
            {saveError ? (
              <span role="alert" className="font-semibold text-[#FFB4BC]">
                {saveError}
              </span>
            ) : topicId === null ? (
              'Choose a topic above first.'
            ) : (
              <>
                <span className="font-bold text-white">{counts.toAdd}</span> to add
                {counts.toReplace > 0 && (
                  <>
                    , <span className="font-bold text-white">{counts.toReplace}</span> to replace
                  </>
                )}
                , {counts.total - toWrite} skipped
              </>
            )}
          </p>
          <button type="button" onClick={save} disabled={saving || topicId === null || toWrite === 0} className={cn(heroButtonClass, 'h-11 text-base')}>
            <Save className="size-4" aria-hidden />
            {saving ? 'Saving…' : `Save ${toWrite} ${toWrite === 1 ? 'question' : 'questions'}`}
          </button>
        </div>
      </div>

      <Dialog open={blocker.state === 'blocked' || confirmStartOver} onClose={keepReviewing} labelledBy="discard-review-heading">
        <div className="space-y-4">
          <div>
            <h2 id="discard-review-heading" className="text-xl font-bold">
              Discard these questions?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Nothing has been saved yet, and any fixes you made here will be lost.</p>
          </div>
          {/* "Keep" comes first so it gets the focus when the dialog opens. */}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="button" variant="outline" className="h-11 flex-1 rounded-lg" onClick={keepReviewing}>
              Keep reviewing
            </Button>
            <Button type="button" className="h-11 flex-1 rounded-lg bg-wrong text-white hover:bg-wrong/90" onClick={discard}>
              Discard
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold',
        focusRing,
        active ? 'border-foreground bg-foreground text-background' : 'bg-card hover:border-primary',
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-background/70' : 'text-muted-foreground')}>{count}</span>
    </button>
  )
}

/** One found question. Closed: status, what will happen, and the text. Open: compare, choose, and fix. */
function ReviewRow({
  item,
  items,
  topics,
  subjects,
  subjectId,
  bookChapters,
  uploadChapter,
  onUpdate,
}: {
  item: ReviewItem
  items: ReviewItem[]
  topics: { id: number; subject_id: number; name: string }[]
  subjects: { id: number; code: string }[]
  /** the subject chosen for the upload (its topics are offered for one question) */
  subjectId: number | null
  /** uploading into her book: the topics she has there (null = not into her book) */
  bookChapters: string[] | null
  /** her book: the topic chosen for the whole upload */
  uploadChapter: string | null
  onUpdate: (change: (item: ReviewItem) => ReviewItem) => void
}) {
  const status = itemStatus(item)
  const errors = Object.values(contentErrors(item))
  const saving = willSave(item)
  const repeatOf = item.repeatOf !== null ? items.find((i) => i.key === item.repeatOf) : undefined

  const outcome = !saving ? 'Skip' : item.decision === 'replace' ? 'Will replace' : 'Will add'

  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 outline-none hover:bg-secondary/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="w-7 shrink-0 pt-0.5 text-right font-heading text-sm font-bold text-muted-foreground tabular-nums">{item.key + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-xs">
              <span className={cn('rounded-full px-2 py-px font-semibold', STATUS[status].className)}>{STATUS[status].label}</span>
              <span className={cn('font-semibold', saving ? 'text-primary' : 'text-muted-foreground')}>{outcome}</span>
            </span>
            <span className={cn('mt-0.5 block leading-snug', saving ? 'font-semibold' : 'text-muted-foreground')}>{item.draft.stem || '(no question text)'}</span>
          </span>
          <ChevronDown className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>

        <div className="space-y-4 px-4 pb-5 sm:pl-15">
          {errors.length > 0 && (
            <ul className="space-y-1 rounded-md bg-wrong-soft px-3 py-2 text-sm font-semibold text-wrong">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {/* Side-by-side compare with what is already in the bank */}
          {status === 'duplicate' && item.matches && (
            <Compare
              title={item.matches[0].exact ? 'Same text already in your bank' : `${Math.round(item.matches[0].score * 100)}% similar to one in your bank`}
              existing={item.matches[0].stem}
              incoming={item.draft.stem}
              extra={item.matches.length > 1 ? `${item.matches.length - 1} more look-alike${item.matches.length > 2 ? 's' : ''}.` : undefined}
            />
          )}
          {status === 'repeat' && repeatOf && <Compare title={`Same as question ${repeatOf.key + 1} in this file`} existing={repeatOf.draft.stem} incoming={item.draft.stem} existingLabel={`Question ${repeatOf.key + 1}`} />}

          <DecisionPicker item={item} disabled={errors.length > 0} onChange={(decision) => onUpdate((i) => ({ ...i, decision }))} />

          <ItemTopic item={item} topics={topics} subjects={subjects} subjectId={subjectId} bookChapters={bookChapters} uploadChapter={uploadChapter} onUpdate={onUpdate} />

          <ItemEditor item={item} onUpdate={onUpdate} />
        </div>
      </details>
    </li>
  )
}

function Compare({ title, existing, incoming, existingLabel = 'Already in your bank', extra }: { title: string; existing: string; incoming: string; existingLabel?: string; extra?: string }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Copy className="size-4 text-[#7A4700]" aria-hidden />
        {title}
      </p>
      <div className="grid gap-2 text-sm md:grid-cols-2">
        <div className="rounded-lg bg-background p-3">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{existingLabel}</p>
          {existing}
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="mb-1 text-xs font-semibold text-primary">In this upload</p>
          {incoming}
        </div>
      </div>
      {extra && <p className="text-xs text-muted-foreground">{extra}</p>}
      <p className="text-xs text-muted-foreground">Two questions can look alike but ask different things (for example, male vs female values). Only you can decide.</p>
    </div>
  )
}

/** Skip / Save anyway / Replace. Replace only shows when there is an existing question to replace. */
function DecisionPicker({ item, disabled, onChange }: { item: ReviewItem; disabled: boolean; onChange: (decision: Decision) => void }) {
  const looksLike = (item.matches?.length ?? 0) > 0 || item.repeatOf !== null
  const options: { value: Decision; label: string }[] = [
    { value: 'skip', label: 'Skip' },
    { value: 'save', label: looksLike ? 'Save anyway' : 'Add' },
  ]
  if (item.replaceId) options.push({ value: 'replace', label: 'Replace the old one' })

  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1.5 text-sm font-semibold">{disabled ? 'Fix the problems above to add this question.' : 'What should happen to this question?'}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-semibold has-focus-visible:ring-3 has-focus-visible:ring-ring/40 has-disabled:cursor-not-allowed has-disabled:opacity-50',
              item.decision === o.value ? 'border-primary bg-primary/[0.06] ring-1 ring-primary' : 'hover:border-primary/50',
            )}
          >
            <input type="radio" name={`decision-${item.key}`} checked={item.decision === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {item.decision === o.value && <Check className="size-4 text-primary" aria-hidden />}
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Fix the question right here: text, choices (exactly four), the answer and explanation. */
function ItemEditor({ item, onUpdate }: { item: ReviewItem; onUpdate: (change: (item: ReviewItem) => ReviewItem) => void }) {
  const id = (name: string) => `item-${item.key}-${name}`
  const { draft } = item

  // Opens by itself only if the question needs fixing when first shown (and then stays open while she types).
  const [startOpen] = useState(() => Object.keys(contentErrors(item)).length > 0)

  function setDraft(change: Partial<ReviewItem['draft']>) {
    onUpdate((i) => ({ ...i, draft: { ...i.draft, ...change } }))
  }

  function removeChoice(index: number) {
    const choices = draft.choices.filter((_, i) => i !== index)
    let correctIndex = draft.correctIndex
    if (correctIndex === index) correctIndex = null
    else if (correctIndex !== null && correctIndex > index) correctIndex -= 1
    setDraft({ choices, correctIndex })
  }

  return (
    <details className="rounded-xl border bg-background/60" open={startOpen}>
      <summary className={cn('cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden', focusRing)}>Edit this question</summary>
      <div className="space-y-4 px-3 pb-4">
        <EditorField id={id('stem')} label="Question">
          <textarea id={id('stem')} rows={3} value={draft.stem} onChange={(e) => setDraft({ stem: e.target.value })} className={cn(fieldClass, 'py-2 text-sm leading-relaxed')} />
        </EditorField>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm">
            <span className="font-semibold">Choices</span> <span className="text-muted-foreground">Tap ○ to mark the correct one</span>
          </legend>
          {draft.choices.map((choice, i) => {
            const isCorrect = draft.correctIndex === i
            return (
              <div key={i} className="flex items-center gap-2">
                <span aria-hidden className={cn('w-4 shrink-0 text-center font-heading font-bold', isCorrect && 'text-correct')}>
                  {LETTERS[i]}
                </span>
                <label htmlFor={id(`choice-${i}`)} className="sr-only">
                  Choice {LETTERS[i]}
                </label>
                <input
                  id={id(`choice-${i}`)}
                  value={choice}
                  onChange={(e) => setDraft({ choices: draft.choices.map((c, j) => (j === i ? e.target.value : c)) })}
                  className={cn(fieldClass, 'h-11 min-w-0 flex-1 text-sm', isCorrect && 'border-correct')}
                />
                <CorrectToggle name={id('correct')} letter={LETTERS[i]} checked={isCorrect} onChange={() => setDraft({ correctIndex: i })} compact />
                {draft.choices.length > CHOICE_COUNT && (
                  <button
                    type="button"
                    onClick={() => removeChoice(i)}
                    aria-label={`Remove choice ${LETTERS[i]}`}
                    className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-wrong-soft hover:text-wrong', focusRing)}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            )
          })}
          {draft.choices.length < CHOICE_COUNT && (
            <button
              type="button"
              onClick={() => setDraft({ choices: [...draft.choices, ''] })}
              className={cn('flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary/10', focusRing)}
            >
              <Plus className="size-4" aria-hidden />
              Add choice {LETTERS[draft.choices.length]}
            </button>
          )}
        </fieldset>

        <EditorField id={id('explanation')} label="Explanation" hint="optional">
          <textarea
            id={id('explanation')}
            rows={2}
            value={draft.explanation}
            onChange={(e) => setDraft({ explanation: e.target.value })}
            className={cn(fieldClass, 'py-2 text-sm leading-relaxed')}
          />
        </EditorField>

      </div>
    </details>
  )
}

/**
 * This one question's topic, if it shouldn't be the one chosen for the whole upload:
 * her own topic name (into her book), or one of the subject's topics.
 */
function ItemTopic({
  item,
  topics,
  subjects,
  subjectId,
  bookChapters,
  uploadChapter,
  onUpdate,
}: {
  item: ReviewItem
  topics: { id: number; subject_id: number; name: string }[]
  subjects: { id: number; code: string }[]
  subjectId: number | null
  bookChapters: string[] | null
  uploadChapter: string | null
  onUpdate: (change: (item: ReviewItem) => ReviewItem) => void
}) {
  const id = `item-${item.key}-topic`
  if (bookChapters) {
    return (
      <EditorField id={id} label="Topic for this question" hint={`empty = same as above${uploadChapter ? ` (${uploadChapter})` : ''}`}>
        <input
          id={id}
          list={`${id}-list`}
          value={item.chapter ?? ''}
          maxLength={CHAPTER_MAX + 20}
          placeholder={uploadChapter ?? 'No topic'}
          onChange={(e) => onUpdate((i) => ({ ...i, chapter: e.target.value.trim() === '' ? null : e.target.value }))}
          className={cn(fieldClass, 'h-11 text-sm')}
        />
        <datalist id={`${id}-list`}>
          {bookChapters.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </EditorField>
    )
  }
  // A subject's topics (the upload's subject), or every board subject's when none is chosen yet.
  const subjectIds = new Set(subjects.map((s) => s.id))
  const choices = topics.filter((t) => (subjectId === null ? subjectIds.has(t.subject_id) : t.subject_id === subjectId))
  const subjectCode = (sid: number) => subjects.find((s) => s.id === sid)?.code ?? ''
  return (
    <EditorField id={id} label="Topic for this question" hint="if different from the one above">
      <NativeSelect
        id={id}
        value={item.draft.topicId ?? ''}
        onChange={(e) => onUpdate((i) => ({ ...i, draft: { ...i.draft, topicId: e.target.value ? Number(e.target.value) : null } }))}
        className="bg-card text-sm"
      >
        <option value="">Same as the upload</option>
        {choices.map((t) => (
          <option key={t.id} value={t.id}>
            {subjectId === null ? `${subjectCode(t.subject_id)}: ` : ''}
            {t.name}
          </option>
        ))}
      </NativeSelect>
    </EditorField>
  )
}

function EditorField({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
        {label}
        {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  )
}
