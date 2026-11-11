import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, ClipboardPaste, FileUp, Info } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { backLinkClass, headerButtonClass, PageHeader } from '@/components/dashboard'
import { FullPageMessage } from '@/components/FullPageMessage'
import { heroButtonClass } from '@/components/report'
import { markBankStale } from '@/lib/offline/bank'
import { ACCEPTED_FILES, extractText, UnreadableFileError } from '@/lib/parsers/extractText'
import { parseQuestions } from '@/lib/parsers/questionParser'
import { useBookTopicId, useSubjects, useTopics } from '@/lib/referenceData'
import { toReviewItems, withMatches, type ReviewItem } from '@/lib/uploadReview'
import { cn } from '@/lib/utils'
import { checkDuplicates } from './uploadApi'
import { useBooks } from './booksApi'
import { UploadReview, UploadSteps, type UploadTarget } from './UploadReview'

type Stage =
  | { name: 'pick' }
  | { name: 'reading'; fileName: string }
  | { name: 'review'; fileName: string; skippedText: string }
  | { name: 'done'; added: number; replaced: number; fileName: string }

const EXAMPLE = `1. Which coagulation factor is known as the stable factor?
A. Factor V
B. Factor VII
C. Factor VIII
D. Factor X
Answer: B
Explanation: Factor VII is stable in stored plasma.`

/** The small tinted buttons, same as on the shelf screen. */
const smallButtonClass =
  'flex h-10 items-center justify-center gap-2 rounded-lg bg-primary/8 px-4 text-sm font-bold text-primary outline-none transition-colors hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px'

// /questions/upload: pick a file (or paste text) → review what was found → save.
// ?subject=ID (from a subject's book): the subject is set, only the topic is asked.
// ?book=ID (from one of her books): no subject; they go into that book, under her own topics there.
export default function QuestionUploadPage() {
  const subjects = useSubjects()
  const topics = useTopics()
  const [searchParams] = useSearchParams()
  const subjectParam = Number(searchParams.get('subject'))
  const bookParam = searchParams.get('book')
  const books = useBooks({ enabled: bookParam !== null })
  const bookTopicId = useBookTopicId()
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<Stage>({ name: 'pick' })
  const [items, setItems] = useState<ReviewItem[]>([])
  const [error, setError] = useState<string | null>(null)
  // Text sent over from the Add a question form, when she pasted several questions there.
  const sentText = (useLocation().state as { pastedText?: string } | null)?.pastedText ?? ''
  const [pasted, setPasted] = useState(sentText)
  const [pasting, setPasting] = useState(sentText !== '')
  const [dragging, setDragging] = useState(false)
  const [checkFailures, setCheckFailures] = useState(0)

  if (subjects.isPending || topics.isPending || (bookParam !== null && books.isPending)) return <FullPageMessage>Loading…</FullPageMessage>
  if (subjects.isError || topics.isError) return <FullPageMessage>Couldn’t load subjects. Check your internet connection, then refresh.</FullPageMessage>

  // Where the questions go, and where to go back to.
  const book = bookParam === null ? undefined : books.data?.find((b) => b.id === bookParam)
  const subject = subjects.data.find((s) => s.id === subjectParam)
  const target: UploadTarget =
    book && bookTopicId !== null ? { kind: 'book', book, topicId: bookTopicId } : subject ? { kind: 'subject', subjectId: subject.id } : { kind: 'free' }
  const backTo = book ? `/questions?book=${book.id}` : subject ? `/questions?subject=${subject.id}` : '/questions'
  const backLabel = book?.title ?? subject?.code ?? 'Questions'

  async function read(fileName: string, getText: () => Promise<string>) {
    setError(null)
    setStage({ name: 'reading', fileName })
    let text: string
    try {
      text = await getText()
    } catch (e) {
      setError(e instanceof UnreadableFileError ? e.message : 'Something went wrong while reading the file. Try again, or paste the text instead.')
      setStage({ name: 'pick' })
      return
    }

    const result = parseQuestions(text)
    if (result.questions.length === 0) {
      setError('No numbered questions were found. Check that each question starts with a number like "1." and its choices with "A." to "D." (see the example below).')
      setStage({ name: 'pick' })
      return
    }

    const found = toReviewItems(result.questions)
    setItems(found)
    setCheckFailures(0)
    setStage({ name: 'review', fileName, skippedText: result.skippedText })

    // Look for look-alikes in the bank; each result fills in as it arrives.
    const failed = await checkDuplicates(
      found.map((i) => ({ key: i.key, stem: i.draft.stem })),
      (key, matches) => setItems((all) => all.map((i) => (i.key === key ? withMatches(i, matches) : i))),
    )
    setCheckFailures(failed)
  }

  function pickFile(file: File | undefined) {
    if (file) void read(file.name, () => extractText(file))
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    pickFile(event.dataTransfer.files[0])
  }

  function startOver() {
    setItems([])
    setPasted('')
    setPasting(false)
    setError(null)
    setStage({ name: 'pick' })
  }

  if (stage.name === 'done') {
    return (
      <div className="mx-auto max-w-xl space-y-4 pt-4 sm:pt-10">
        <section aria-labelledby="done-heading" className="space-y-4 rounded-2xl bg-primary-deep p-6 text-center text-white">
          <CircleCheck className="mx-auto size-10 text-highlight" aria-hidden />
          <div>
            <h1 id="done-heading" className="text-3xl font-bold">
              {stage.added} {stage.added === 1 ? 'question' : 'questions'} added
            </h1>
            {stage.replaced > 0 && <p className="text-white/85">{stage.replaced} existing {stage.replaced === 1 ? 'question was' : 'questions were'} replaced.</p>}
            <p className="mt-2 text-white/85">They’re ready to use in Practice, Mock exam and Flashcards.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            {/* back to the book they went into, or all questions */}
            <Link to={target.kind === 'free' ? '/questions?view=all' : backTo} className={headerButtonClass}>
              See them
            </Link>
            <button type="button" onClick={startOver} className="h-12 rounded-lg px-4 font-semibold text-white/90 hover:bg-white/10 sm:h-11">
              Upload another
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (stage.name === 'review') {
    return (
      <UploadReview
        target={target}
        fileName={stage.fileName}
        skippedText={stage.skippedText}
        items={items}
        onChange={setItems}
        checkFailures={checkFailures}
        subjects={subjects.data}
        topics={topics.data}
        onStartOver={startOver}
        onSaved={(added, replaced) => {
          void queryClient.invalidateQueries({ queryKey: ['question-bank'] })
          void queryClient.invalidateQueries({ queryKey: ['warmup'] })
          void queryClient.invalidateQueries({ queryKey: ['mistakes'] })
          void queryClient.invalidateQueries({ queryKey: ['question-pool'] })
          void queryClient.invalidateQueries({ queryKey: ['uploads'] }) // new file for "One upload"
          void queryClient.invalidateQueries({ queryKey: ['books'] }) // they went into her book
          void queryClient.invalidateQueries({ queryKey: ['source-counts'] })
          markBankStale() // new questions: save them for offline Practice at the next chance
          setStage({ name: 'done', added, replaced, fileName: stage.fileName })
        }}
      />
    )
  }

  const reading = stage.name === 'reading'

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to={backTo} className={cn(backLinkClass, 'max-w-full')}>
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{backLabel}</span>
      </Link>
      <PageHeader title="Upload questions" subtitle="Nothing is saved until you review it. Your file stays on your device." />
      <UploadSteps current={1} />

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-wrong-soft px-3 py-2.5 text-sm font-semibold text-wrong">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {pasting ? (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <label htmlFor="paste" className="flex items-center gap-2 font-heading text-lg font-bold">
            <ClipboardPaste className="size-5 text-primary" aria-hidden />
            Paste your questions
          </label>
          <textarea
            id="paste"
            autoFocus
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            className="min-h-56 rounded-lg border border-input bg-background px-3 py-2.5 leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setPasting(false)} className={smallButtonClass}>
              <FileUp className="size-4" aria-hidden />
              Choose a file instead
            </button>
            <button type="button" disabled={reading || pasted.trim() === ''} onClick={() => void read('Pasted text', async () => pasted)} className={cn(heroButtonClass, 'w-auto px-7 focus-visible:ring-ring/50')}>
              {reading ? 'Reading…' : 'Read text'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {/* Drop zone. The whole box is the file picker's label, so a tap anywhere opens it. */}
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'relative flex min-h-52 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card p-6 text-center transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
              dragging ? 'border-primary bg-primary/5' : 'border-input hover:border-primary',
              reading && 'pointer-events-none opacity-60',
            )}
          >
            <span className={cn(heroButtonClass, 'w-auto px-7')}>
              <FileUp className="size-5" aria-hidden />
              {reading ? `Reading ${stage.fileName}…` : 'Choose a file'}
            </span>
            <span className="text-sm text-muted-foreground">
              <span className="max-md:hidden">or drop it here · </span>PDF, Word (.docx) or .txt
            </span>
            <input
              type="file"
              accept={ACCEPTED_FILES}
              disabled={reading}
              onChange={(e) => {
                pickFile(e.target.files?.[0])
                e.target.value = '' // so the same file can be picked again
              }}
              className="sr-only"
            />
          </label>
          <button type="button" disabled={reading} onClick={() => setPasting(true)} className={smallButtonClass}>
            <ClipboardPaste className="size-4" aria-hidden />
            Paste text instead
          </button>
        </div>
      )}

      {/* Always in view: this is why a file reads well or doesn't, so she should see it before choosing one. */}
      <section aria-labelledby="format-heading" className="space-y-2 border-t border-dashed pt-4">
        <h2 id="format-heading" className="font-heading text-lg font-bold">
          Your questions should look like this
        </h2>
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <pre className="overflow-x-auto rounded-lg border bg-card p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{EXAMPLE}</pre>
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>Each question starts with a number: “1.”, “1)” or “Q1.”</li>
            <li>Choices start with A. to D. (or a), (a)). They can also be on one line.</li>
            <li>The answer can be “Answer: B”, “Ans: b”, a * beside the right choice, or an ANSWER KEY list at the end.</li>
            <li>“Explanation:” or “Rationale:” is optional.</li>
            <li>Scanned PDFs (pictures of pages) can’t be read. Copy the text and paste it instead.</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
