// notify-admin: sends "New access request" to the admin's phone (Web Push). See migration 0040.
//
// The database pokes this function with an EMPTY body when someone new signs in (or the admin taps "Send test").
// It never trusts the caller: it always asks the database what to send (claim_push_jobs, server key only),
// and each request is announced only once. So a stranger calling this address can't send anything.
//
// Secrets (Supabase Dashboard -> Edge Functions -> Secrets; never in git):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  the app's push keys (made once with: npx web-push generate-vapid-keys)
//   VAPID_SUBJECT                        the app's address, e.g. https://projectrmt.pages.dev (push services ask for a contact)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are filled in by Supabase itself.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
// Pinned: 3.6.7 has been out since 2024 with no known security problems. Don't take brand-new releases blindly.
import webpush from 'npm:web-push@3.6.7'

type Subscription = { endpoint: string; p256dh: string; auth: string }
type Jobs = {
  requests: { user_id: string; email: string | null; name: string | null }[]
  tests: string[]
  subscriptions: Subscription[]
}
type Message = { title: string; body: string; url: string; tag: string }

const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing secret ${name}`)
  return value
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    })

    const { data, error } = await db.rpc('claim_push_jobs')
    if (error) throw error
    const jobs = data as Jobs

    // What goes where: every new request to every admin phone; a test only to the phone that asked.
    const sends: { sub: Subscription; message: Message }[] = []
    for (const request of jobs.requests) {
      const who = request.name ?? request.email ?? 'Someone'
      const message: Message = {
        title: 'New access request',
        body: request.name && request.email ? `${request.name} (${request.email}) wants to join. Tap to review.` : `${who} wants to join. Tap to review.`,
        url: '/settings',
        tag: `request-${request.user_id}`,
      }
      for (const sub of jobs.subscriptions) sends.push({ sub, message })
    }
    for (const endpoint of jobs.tests) {
      const sub = jobs.subscriptions.find((s) => s.endpoint === endpoint)
      if (!sub) continue
      sends.push({
        sub,
        message: { title: 'ProjectRMT', body: 'Test notification. You’ll get one like this when someone asks to join.', url: '/settings', tag: 'test' },
      })
    }

    let sent = 0
    for (const { sub, message } of sends) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(message),
          { TTL: 60 * 60 * 24 }, // keep trying for a day if the phone is off
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 404 / 410 = this phone is gone (app deleted, notifications turned off): stop sending to it.
        if (status === 404 || status === 410) {
          await db.rpc('forget_push_subscription', { p_endpoint: sub.endpoint })
        } else {
          console.error('push failed', status)
        }
      }
    }

    return Response.json({ sent })
  } catch (err) {
    console.error('notify-admin failed', err instanceof Error ? err.message : err)
    return new Response('Failed', { status: 500 })
  }
})
