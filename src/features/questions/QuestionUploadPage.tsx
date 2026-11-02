import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, ClipboardPaste, FileUp, Info } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { headerButtonClass, headerSecondaryClass, PageHeader } from '@/components/dashboard'
import { FullPageMessage } from '@/components/FullPageMessage'
import { ACCEPTED_FILES, extractText, UnreadableFileError } from '@/lib/parsers/extractText'
import { parseQuestions } from '@/lib/parsers/questionParser'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { toReviewItems, withMatches, type ReviewItem } from '@/lib/uploadReview'
import { cn } from '@/lib/utils'
import { checkDuplicates } from './uploadApi'
import { UploadReview } from './UploadReview'

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

// /questions/upload: pick a file (or paste text) → review what was found → save.
export default function QuestionUploadPage() {
  const subjects = useSubjects()
  const topics = useTopics()
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<Stage>({ name: 'pick' })
  const [items, setItems] = useState<ReviewItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')
  const [dragging, setDragging] = useState(false)
  const [checkFailures, setCheckFailures] = useState(0)

  if (subjects.isPending || topics.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (subjects.isError || topics.isError) return <FullPageMessage>Couldn’t load subjects. Check your internet connection, then refresh.</FullPageMessage>

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
            <p className="mt-2 text-white/85">
              From {stage.fileName}. They are marked <span className="font-semibold text-white">To verify</span>, since a computer read them. Check each one in Questions.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/questions" className={headerButtonClass}>
              Go to Questions
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
          setStage({ name: 'done', added, replaced, fileName: stage.fileName })
        }}
      />
    )
  }

  const reading = stage.name === 'reading'

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link to="/questions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Questions
      </Link>
      <PageHeader title="Upload questions" subtitle="Read questions from a PDF, a Word file or pasted text. The file stays on your device; only the questions you choose are saved." />

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-wrong-soft px-3 py-2.5 text-sm font-semibold text-wrong">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Drop zone. The whole box is the file picker's label, so a tap anywhere opens it. */}
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card p-6 text-center transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
            dragging ? 'border-primary bg-primary/5' : 'border-input hover:border-primary',
            reading && 'pointer-events-none opacity-60',
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FileUp className="size-7" aria-hidden />
          </span>
          <span>
            <span className="block font-heading text-lg font-bold">{reading ? `Reading ${stage.fileName}…` : 'Choose a file'}</span>
            <span className="block text-sm text-muted-foreground">or drop it here. PDF, Word (.docx) or .txt</span>
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

        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <label htmlFor="paste" className="flex items-center gap-2 font-heading text-lg font-bold">
            <ClipboardPaste className="size-5 text-primary" aria-hidden />
            Or paste text
          </label>
          <textarea
            id="paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={EXAMPLE}
            className="min-h-40 flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <button
            type="button"
            disabled={reading || pasted.trim() === ''}
            onClick={() => void read('Pasted text', async () => pasted)}
            className={cn(headerSecondaryClass, 'disabled:opacity-50')}
          >
            Read pasted text
          </button>
        </div>
      </div>

      <details className="group rounded-2xl border bg-card">
        <summary className="cursor-pointer list-none px-4 py-3 font-semibold outline-none hover:bg-secondary/50 focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
          How should the questions look?
        </summary>
        <div className="grid gap-4 px-4 pb-4 text-sm md:grid-cols-2">
          <pre className="overflow-x-auto rounded-lg bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{EXAMPLE}</pre>
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>Each question starts with a number: “1.”, “1)” or “Q1.”</li>
            <li>Choices start with A. to D. (or a), (a)). They can also be on one line.</li>
            <li>The answer can be “Answer: B”, “Ans: b”, a * beside the right choice, or an ANSWER KEY list at the end.</li>
            <li>“Explanation:” or “Rationale:” is optional.</li>
            <li>Scanned PDFs (pictures of pages) can’t be read. Copy the text and paste it instead.</li>
          </ul>
        </div>
      </details>
    </div>
  )
}
