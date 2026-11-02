/** Shown instead of the app while .env.local is missing, so the app doesn't crash. */
export function SetupNotice() {
  return (
    <main className="mx-auto max-w-lg space-y-3 p-6">
      <h1 className="text-xl font-semibold">Supabase isn't connected yet</h1>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code>.
        </li>
        <li>Fill in your Supabase project URL and anon key (Project Settings → API).</li>
        <li>
          Restart <code>npm run dev</code>.
        </li>
      </ol>
      <p className="text-sm text-muted-foreground">See the README for the full setup steps.</p>
    </main>
  )
}
