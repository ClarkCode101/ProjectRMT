import { AlertTriangle, Check, ChevronDown, Copy, Plus, Save, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { headerSecondaryClass, PageHeader } from '@/components/dashboard'
import { NativeSelect } from '@/components/NativeSelect'
import { heroButtonClass } from '@/components/report'
import { Label } from '@/components/ui/label'
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

type Props = {
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

export function UploadReview({ fileName, skippedText, items, onChange, checkFailures, subjects, topics, onStartOver, onSaved }: Props) {
  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [topicId, setTopicId] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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
    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveUpload(fileName, plannedWrites(items, topicId))
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
          <button type="button" onClick={onStartOver} className={headerSecondaryClass}>
            Start over
          </button>
        }
      />

      {/* 1. Where they go */}
      <section aria-labelledby="topic-heading" className="rounded-2xl border bg-card p-4">
        <h2 id="topic-heading" className="font-heading text-lg font-bold">
          Topic for these questions
        </h2>
        <p className="text-sm text-muted-foreground">You can change the topic of a single question when you open it below.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="upload-subject">Subject</Label>
            <NativeSelect
              id="upload-subject"
              value={subjectId ?? ''}
              onChange={(e) => {
                setSubjectId(e.target.value ? Number(e.target.value) : null)
                setTopicId(null)
              }}
              className="bg-card"
            >
              <option value="">Choose a subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}: {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="upload-topic">Topic</Label>
            <NativeSelect
              id="upload-topic"
              value={topicId ?? ''}
              disabled={subjectId === null}
              onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : null)}
              className="bg-card"
            >
              <option value="">{subjectId === null ? 'Choose a subject first' : 'Choose a topic'}</option>
              {topics
                .filter((t) => t.subject_id === subjectId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </NativeSelect>
          </div>
        </div>
      </section>

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
              <ReviewRow key={item.key} item={item} items={items} topics={topics} subjects={subjects} onUpdate={(change) => update(item.key, change)} />
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
  onUpdate,
}: {
  item: ReviewItem
  items: ReviewItem[]
  topics: { id: number; subject_id: number; name: string }[]
  subjects: { id: number; code: string }[]
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

          <ItemEditor item={item} topics={topics} subjects={subjects} onUpdate={onUpdate} />
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

/** Fix the question right here: text, choices (exactly four), the answer, explanation and topic. */
function ItemEditor({
  item,
  topics,
  subjects,
  onUpdate,
}: {
  item: ReviewItem
  topics: { id: number; subject_id: number; name: string }[]
  subjects: { id: number; code: string }[]
  onUpdate: (change: (item: ReviewItem) => ReviewItem) => void
}) {
  const id = (name: string) => `item-${item.key}-${name}`
  const { draft } = item
  const subjectCode = (subjectId: number) => subjects.find((s) => s.id === subjectId)?.code ?? ''

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
          <legend className="mb-1.5 text-sm font-semibold">Choices (tap the letter of the correct one)</legend>
          {draft.choices.map((choice, i) => {
            const isCorrect = draft.correctIndex === i
            return (
              <div key={i} className="flex items-center gap-2">
                <label
                  className={cn(
                    'flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border font-heading font-bold has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                    isCorrect ? 'border-correct bg-correct text-white' : 'bg-card hover:border-correct',
                  )}
                >
                  <input type="radio" name={id('correct')} checked={isCorrect} onChange={() => setDraft({ correctIndex: i })} className="sr-only" />
                  <span className="sr-only">Mark choice {LETTERS[i]} as correct</span>
                  {isCorrect ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <span aria-hidden>{LETTERS[i]}</span>}
                </label>
                <label htmlFor={id(`choice-${i}`)} className="sr-only">
                  Choice {LETTERS[i]}
                </label>
                <input
                  id={id(`choice-${i}`)}
                  value={choice}
                  onChange={(e) => setDraft({ choices: draft.choices.map((c, j) => (j === i ? e.target.value : c)) })}
                  className={cn(fieldClass, 'h-10 text-sm', isCorrect && 'border-correct')}
                />
                {draft.choices.length > CHOICE_COUNT && (
                  <button
                    type="button"
                    onClick={() => removeChoice(i)}
                    aria-label={`Remove choice ${LETTERS[i]}`}
                    className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-wrong-soft hover:text-wrong', focusRing)}
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

        <EditorField id={id('topic')} label="Topic" hint="if different from the one above">
          <NativeSelect
            id={id('topic')}
            value={draft.topicId ?? ''}
            onChange={(e) => setDraft({ topicId: e.target.value ? Number(e.target.value) : null })}
            className="bg-card text-sm"
          >
            <option value="">Same as the upload</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {subjectCode(t.subject_id)}: {t.name}
              </option>
            ))}
          </NativeSelect>
        </EditorField>
      </div>
    </details>
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
