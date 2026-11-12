import { supabase } from './supabase'

/**
 * Phone notifications for the admin (Web Push, migration 0040).
 *
 * Each phone is turned on separately: the phone gives us an address (a "subscription"), we save it, and the
 * Edge Function notify-admin sends to it when someone new asks to join. The service worker (public/push-sw.js)
 * shows the notification, even when the app is closed.
 */

/**
 * The app's public push key. Public by design (every browser that subscribes gets it). Its private half is
 * only in the Edge Function's secrets. Made with: npx web-push generate-vapid-keys
 */
export const VAPID_PUBLIC_KEY = 'BJavw2GSfpxWLBgUtLxK-9dyMd9GUfQZQCCmGFqBH7pOgJeAnuAIYr1T2MtKKQr56LEZqIQ7Ltmu3esXLpVpo0c'

/**
 * What this device can do:
 * - ready:         can turn notifications on
 * - needs-install: iPhone / iPad in Safari: notifications only work from the Home Screen icon
 * - unsupported:   this browser has no Web Push
 */
export type PushSupport = 'ready' | 'needs-install' | 'unsupported'

export function pickPushSupport(device: { hasPush: boolean; ios: boolean; standalone: boolean }): PushSupport {
  // On iPhone the push parts only exist inside the installed app, so check this first.
  if (device.ios && !device.standalone) return 'needs-install'
  return device.hasPush ? 'ready' : 'unsupported'
}

/** The key as bytes. It's written in "base64url" (- and _ instead of + and /, no = at the end). */
export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const base64 = (text + '='.repeat((4 - (text.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function hasPushApi(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** The phone's subscription, or null. Waits for the service worker, so only call it when hasPushApi(). */
async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/**
 * - on:      this phone gets notifications
 * - off:     not turned on (or the server forgot this phone)
 * - blocked: she said "Don't Allow"; only the phone's Settings can change that
 */
export type PushState = 'on' | 'off' | 'blocked'

export async function loadPushState(): Promise<PushState> {
  if (!hasPushApi()) return 'off'
  if (Notification.permission === 'denied') return 'blocked'
  const subscription = await currentSubscription()
  if (!subscription || Notification.permission !== 'granted') return 'off'
  const { data, error } = await supabase.rpc('has_push_subscription', { p_endpoint: subscription.endpoint })
  if (error) throw error
  return data ? 'on' : 'off'
}

/** Asks the phone for permission (must run right after a tap), then saves this phone. */
export async function turnOnPush(): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'blocked'
  if (permission !== 'granted') return 'off'

  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) }))

  const keys = subscription.toJSON().keys ?? {}
  if (!keys.p256dh || !keys.auth) throw new Error('The phone gave no keys')
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  })
  if (error) throw error
  return 'on'
}

/** Stops notifications on this phone (here and on the server). */
export async function turnOffPush() {
  const subscription = await currentSubscription()
  if (!subscription) return
  const { error } = await supabase.rpc('delete_push_subscription', { p_endpoint: subscription.endpoint })
  if (error) throw error
  await subscription.unsubscribe()
}

/** Sends a test notification to this phone. It arrives in a few seconds. */
export async function sendTestPush() {
  const subscription = await currentSubscription()
  if (!subscription) throw new Error('Not turned on')
  const { error } = await supabase.rpc('send_test_push', { p_endpoint: subscription.endpoint })
  if (error) throw error
}

export function canUsePush(): boolean {
  return hasPushApi()
}
