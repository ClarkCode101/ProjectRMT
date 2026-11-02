import { missingEnvVars } from '@/lib/supabase'

/** Shown instead of the app while the Supabase settings are missing, so the app doesn't crash. */
export function SetupNotice() {
  return (
    <main className="mx-auto max-w-lg space-y-3 p-6">
      <h1 className="text-xl font-semibold">Supabase isn't connected yet</h1>
      <p className="text-sm">
        This build is missing:{' '}
        {missingEnvVars.map((name) => (
          <code key={name} className="mr-2 rounded bg-muted px-1">
            {name}
          </code>
        ))}
      </p>
      <p className="text-sm font-medium">On your computer:</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code> and fill in the values.
        </li>
        <li>
          Restart <code>npm run dev</code>.
        </li>
      </ol>
      <p className="text-sm font-medium">On Cloudflare Pages:</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Settings → Variables and Secrets → add them for Production (exact names above).</li>
        <li>Deployments → Retry deployment. Values are baked in at build time, so a new build is required.</li>
      </ol>
      <p className="text-sm text-muted-foreground">See the README for the full setup steps.</p>
    </main>
  )
}
