import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, X } from 'lucide-react'
import { useId, useState, useSyncExternalStore, type FormEvent } from 'react'
import { headerSecondaryClass } from '@/components/dashboard'
import { Dialog } from '@/components/Dialog'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/authContext'
import {
  clearNotice,
  fetchNotice,
  hideNotice,
  isNoticeHidden,
  NOTICE_MAX_LENGTH,
  noticeDate,
  noticeProblem,
  postNotice,
  readHiddenNotice,
  showNoticeAgain,
  subscribeHiddenNotice,
  type Notice,
  type NoticePlace,
} from '@/lib/notices'
import { useOnline } from '@/lib/offline/useOfflineSync'
import { cn } from '@/lib/utils'

// The admin's notice at the top of a page (migration 0036), in two parts:
// - <NoticeBoard>: the notice itself, a gold bulletin slip above the shelves, for MEMBERS. A new notice always
//   shows here once; X folds it away.
// - <NoticeButton>: a button in the page header row, so it takes no extra space:
//     member, notice folded → "Notice" (opens it again; it's never lost)
//     admin                 → "Post notice" / "Edit notice". The admin never gets the card on the page, so
//                             posting doesn't push the shelves down; the popup shows the current text.
// The message is plain text: React shows it as text, never as HTML.

const TEXTAREA_CLASS =
  'min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

/** The small blue text buttons in the popup (Remove notice, Cancel). */
const TEXT_BUTTON =
  'h-11 rounded-md px-3 text-sm font-bold text-primary hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:text-muted-foreground'

function useNotice(place: NoticePlace) {
  // No internet or the table isn't there yet: just show nothing (retry: false keeps it quick).
  return useQuery({ queryKey: ['notice', place], queryFn: () => fetchNotice(place), retry: false })
}

/** Which notice she folded away on this device (its posted_at), kept in step between the card and the button. */
function useHiddenAt(place: NoticePlace) {
  return useSyncExternalStore(subscribeHiddenNotice, () => readHiddenNotice(place))
}

/** The popup where the admin writes a new notice, or changes or removes the current one. */
function NoticeDialog({
  place,
  onClose,
  current,
}: {
  place: NoticePlace
  onClose: () => void
  /** the notice that's up now, or null when posting the first one */
  current: Notice | null
}) {
  const queryClient = useQueryClient()
  const online = useOnline()
  const [draft, setDraft] = useState(current?.body ?? '')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState<'posting' | 'removing' | null>(null)
  const [failed, setFailed] = useState<'post' | 'remove' | null>(null)
  const headingId = useId()
  const fieldId = useId()
  const problem = noticeProblem(draft)
  const length = draft.trim().length

  async function run(kind: 'post' | 'remove', action: () => Promise<void>) {
    setBusy(kind === 'post' ? 'posting' : 'removing')
    setFailed(null)
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: ['notice', place] })
      onClose()
    } catch {
      setFailed(kind)
    }
    setBusy(null)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setTried(true)
    if (problem || !online) return
    void run('post', () => postNotice(place, draft))
  }

  const errorText = !online
    ? 'Connect to the internet to change the notice.'
    : tried && problem
      ? problem
      : failed === 'post'
        ? 'Couldn’t post it. Check your internet connection and try again.'
        : failed === 'remove'
          ? 'Couldn’t remove it. Check your internet connection and try again.'
          : null

  return (
    <Dialog open onClose={onClose} labelledBy={headingId} size="lg">
      <form onSubmit={handleSubmit} className="space-y-3 p-5">
        <h2 id={headingId} className="flex items-center gap-2 text-xl font-bold">
          <Megaphone className="size-5 text-[#8A5A10]" aria-hidden />
          Notice to members
        </h2>
        <p className="text-sm text-muted-foreground">
          {current
            ? `Posted ${noticeDate(current.postedAt)}. Members see it at the top of Questions. Posting a change shows it again to people who hid it.`
            : 'Members see it at the top of Questions, and can fold it away.'}
        </p>
        <label htmlFor={fieldId} className="sr-only">
          Message
        </label>
        <textarea
          id={fieldId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={NOTICE_MAX_LENGTH + 20}
          placeholder="e.g. More Microbiology questions are coming this week."
          className={TEXTAREA_CLASS}
          autoFocus
        />
        {errorText && (
          <p role="alert" className="text-sm text-destructive">
            {errorText}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={length > NOTICE_MAX_LENGTH ? 'text-sm font-semibold text-wrong' : 'text-sm text-muted-foreground'}>
            {length} / {NOTICE_MAX_LENGTH}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-1">
            {current && (
              <button
                type="button"
                className={cn(TEXT_BUTTON, 'text-wrong hover:bg-wrong/5')}
                onClick={() => void run('remove', () => clearNotice(place))}
                disabled={busy !== null || !online}
              >
                {busy === 'removing' ? 'Removing…' : 'Remove notice'}
              </button>
            )}
            <button type="button" className={TEXT_BUTTON} onClick={onClose} disabled={busy !== null}>
              Cancel
            </button>
            <Button type="submit" className="h-11 rounded-md px-5 font-heading text-base font-bold" disabled={busy !== null}>
              {busy === 'posting' ? 'Posting…' : current ? 'Post new notice' : 'Post notice'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}

/** The header-row button: "Post notice" / "Edit notice" for the admin, "Notice" for a member who folded it away. */
export function NoticeButton({ place }: { place: NoticePlace }) {
  const isAdmin = useAuth().access?.isAdmin ?? false
  const notice = useNotice(place)
  const hiddenAt = useHiddenAt(place)
  const [open, setOpen] = useState(false)

  if (!notice.isSuccess) return null
  const current = notice.data

  if (!isAdmin) {
    if (!current || !isNoticeHidden(current, hiddenAt)) return null
    return (
      <button type="button" onClick={() => showNoticeAgain(place)} className={cn(headerSecondaryClass, 'whitespace-nowrap')}>
        <Megaphone className="size-5 text-[#8A5A10]" aria-hidden />
        Notice
      </button>
    )
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(headerSecondaryClass, 'whitespace-nowrap')}>
        <Megaphone className="size-5 text-[#8A5A10]" aria-hidden />
        {current ? 'Edit notice' : 'Post notice'}
      </button>
      {/* A fresh popup each time it opens, filled with the notice that's up now. */}
      {open && <NoticeDialog key={current?.postedAt ?? 'new'} place={place} onClose={() => setOpen(false)} current={current} />}
    </>
  )
}

/** The notice itself, for members. Nothing when there's none, when she folded this one away, or for the admin. */
export function NoticeBoard({ place }: { place: NoticePlace }) {
  const isAdmin = useAuth().access?.isAdmin ?? false
  const notice = useNotice(place)
  const hiddenAt = useHiddenAt(place)
  const headingId = useId()

  const current = notice.data ?? null
  if (!current || isAdmin || isNoticeHidden(current, hiddenAt)) return null

  return (
    <section
      aria-labelledby={headingId}
      className="animate-in fade-in relative overflow-hidden rounded-xl border border-highlight/60 bg-highlight-soft py-3 pr-3 pl-5 duration-200"
    >
      {/* The gold stripe on the left, like a flag on a report. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-highlight" />
      <div className="flex items-start gap-3">
        <Megaphone className="mt-0.5 size-5 shrink-0 text-[#8A5A10]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-sans text-xs font-bold tracking-[0.14em] text-[#8A5A10] uppercase">
            Notice from admin
            <span className="font-semibold tracking-normal normal-case"> · {noticeDate(current.postedAt)}</span>
          </h2>
          <p className="mt-1 break-words whitespace-pre-line">{current.body}</p>
        </div>
        <button
          type="button"
          aria-label="Hide this notice (open it again with the Notice button at the top)"
          title="Hide (the Notice button at the top opens it again)"
          onClick={() => hideNotice(place, current)}
          className="grid size-10 shrink-0 place-items-center rounded-md text-[#8A5A10] hover:bg-highlight/20 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
    </section>
  )
}
