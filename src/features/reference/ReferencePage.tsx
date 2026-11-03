import { Search, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/dashboard'
import { REFERENCE_ITEMS, type RefKind, type RefSubject } from '@/data/reference'
import { useSubjects } from '@/lib/referenceData'
import { cn } from '@/lib/utils'

const KINDS: { value: RefKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'value', label: 'Normal values' },
  { value: 'formula', label: 'Formulas' },
  { value: 'mnemonic', label: 'Memory aids' },
]

const SUBJECT_ORDER: RefSubject[] = ['CC', 'MICRO', 'HEMA', 'BBIS', 'CM', 'HTMLE']

/** Lowercase, no accents or symbols, so "mchc" finds "MCHC (g/dL)" and "na" finds "Na⁺". */
function plain(text: string) {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
}

export default function ReferencePage() {
  const subjects = useSubjects()
  const nameOf = new Map((subjects.data ?? []).map((s) => [s.code, s.name]))
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState<RefSubject | 'all'>('all')
  const [kind, setKind] = useState<RefKind | 'all'>('all')

  const words = plain(query).split(' ').filter(Boolean)
  const shown = REFERENCE_ITEMS.filter(
    (item) =>
      (subject === 'all' || item.subject === subject) &&
      (kind === 'all' || item.kind === kind) &&
      words.every((w) => plain(`${item.title} ${item.value} ${item.notes ?? ''} ${item.subject}`).includes(w)),
  )
  const groups = SUBJECT_ORDER.map((code) => ({ code, items: shown.filter((i) => i.subject === code) })).filter((g) => g.items.length > 0)

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Quick reference" subtitle="Normal values, formulas and memory aids, all in one place." />

      <p className="flex items-start gap-2 rounded-lg border border-highlight/50 bg-highlight-soft px-3 py-2.5 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#8A5200]" aria-hidden />
        <span>
          <span className="font-semibold">Starter values.</span> Reference ranges differ between labs and books. Check each one against your reviewer.
        </span>
      </p>

      {/* ---------- Search + filters ---------- */}
      <div className="space-y-3">
        <div className="relative">
          <label htmlFor="ref-search" className="sr-only">
            Search the reference
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            id="ref-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. MCHC, potassium, Kidd"
            className="h-12 w-full rounded-full border bg-card pr-4 pl-11 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Subject">
            {(['all', ...SUBJECT_ORDER] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setSubject(code)}
                aria-pressed={subject === code}
                className={cn(
                  'h-9 rounded-full border px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                  subject === code ? 'border-primary bg-primary text-white' : 'bg-card hover:border-primary/50',
                )}
              >
                {code === 'all' ? 'All subjects' : code}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg bg-secondary p-1" role="group" aria-label="Kind">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                aria-pressed={kind === k.value}
                className={cn(
                  'h-8 rounded-md px-2.5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  kind === k.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- Results, grouped by subject, laid out like a lab report: name left, value right ---------- */}
      <p className="sr-only" aria-live="polite">
        {shown.length} {shown.length === 1 ? 'result' : 'results'}
      </p>
      {groups.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-8 text-center text-muted-foreground">Nothing matches “{query}”. Try a shorter word.</p>
      ) : (
        groups.map((group) => (
          <section key={group.code} aria-labelledby={`ref-${group.code}`} className="space-y-2">
            <h2 id={`ref-${group.code}`} className="flex items-baseline gap-2">
              <span className="font-heading text-lg font-bold">{group.code}</span>
              <span className="text-sm text-muted-foreground">{nameOf.get(group.code)}</span>
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {group.items.map((item) => (
                <li key={`${item.subject}-${item.title}`} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {item.kind === 'value' ? 'Normal value' : item.kind === 'formula' ? 'Formula' : 'Memory aid'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className={cn('font-heading font-bold tabular-nums', item.kind === 'formula' && 'text-primary')}>{item.value}</p>
                    {item.notes && <p className="mt-0.5 text-sm text-muted-foreground">{item.notes}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
