import { supabase } from './supabase'

// Notices (migration 0036): a short message from the admin to every member, at the top of a page.
// Members can hide it on their device; a new notice shows again because its posted_at is different.

export type NoticePlace = 'questions' | 'home'

export type Notice = {
  body: string
  /** ISO time it was posted (or last changed) */
  postedAt: string
}

export const NOTICE_MAX_LENGTH = 280

/** The notice for a page, or null if there is none. */
export async function fetchNotice(place: NoticePlace): Promise<Notice | null> {
  const { data, error } = await supabase.from('notices').select('body, posted_at').eq('place', place).maybeSingle()
  if (error) throw error
  return data ? { body: data.body, postedAt: data.posted_at } : null
}

/** Admin: post or change the notice. */
export async function postNotice(place: NoticePlace, body: string) {
  const { error } = await supabase.rpc('set_notice', { p_place: place, p_body: body })
  if (error) throw error
}

/** Admin: take the notice down. */
export async function clearNotice(place: NoticePlace) {
  const { error } = await supabase.rpc('clear_notice', { p_place: place })
  if (error) throw error
}

/** What's wrong with the text in the admin's box, or null when it can be posted. */
export function noticeProblem(body: string): string | null {
  const text = body.trim()
  if (text === '') return 'Write a message first.'
  if (text.length > NOTICE_MAX_LENGTH) return `Keep it to ${NOTICE_MAX_LENGTH} characters or fewer.`
  return null
}

/** Hidden only if she hid THIS notice (same posted_at). A new or changed notice shows again. */
export function isNoticeHidden(notice: Notice, hiddenPostedAt: string | null): boolean {
  return hiddenPostedAt === notice.postedAt
}

const hiddenKey = (place: NoticePlace) => `projectrmt:notice-hidden:${place}`

/** Which notice she hid on this device (its posted_at), or null. */
export function readHiddenNotice(place: NoticePlace): string | null {
  try {
    return localStorage.getItem(hiddenKey(place))
  } catch {
    return null
  }
}

// The card and the header's "Notice" button are separate components, so hiding and showing tell both.
const listeners = new Set<() => void>()

/** For useSyncExternalStore: call `listener` whenever a notice is hidden or shown again. */
export function subscribeHiddenNotice(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** X on the card: fold this notice away (it stays one tap away, in the header). */
export function hideNotice(place: NoticePlace, notice: Notice) {
  try {
    localStorage.setItem(hiddenKey(place), notice.postedAt)
  } catch {
    // storage blocked: it just shows again next time
  }
  listeners.forEach((listener) => listener())
}

/** The header's "Notice" button: open the folded notice again. */
export function showNoticeAgain(place: NoticePlace) {
  try {
    localStorage.removeItem(hiddenKey(place))
  } catch {
    // storage blocked: nothing was saved
  }
  listeners.forEach((listener) => listener())
}

/** "Nov 11" (this year) or "Nov 11, 2025". */
export function noticeDate(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}
