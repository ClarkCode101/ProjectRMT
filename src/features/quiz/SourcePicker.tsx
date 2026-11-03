import { Group, Tile } from '@/components/ChoiceTiles'
import { NativeSelect } from '@/components/NativeSelect'
import { Label } from '@/components/ui/label'
import { useUploads, type SourceChoice, type SourceFilter } from './api'

const SOURCES: { value: Exclude<SourceFilter, 'upload'>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'builtin', label: 'Built-in' },
  { value: 'mine', label: 'Mine' },
]

function uploadLabel(upload: { file_name: string; question_count: number | null; created_at: string | null }) {
  const date = upload.created_at ? new Date(upload.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : null
  return [upload.file_name, `${upload.question_count ?? 0} questions`, date].filter(Boolean).join(' · ')
}

/**
 * "Where should the questions come from?" (PROJECT_PLAN.md §6).
 * Shared by every study mode, so they all filter questions the same way.
 */
export function SourcePicker({ value, onChange }: { value: SourceChoice; onChange: (value: SourceChoice) => void }) {
  const uploads = useUploads()
  const uploadList = uploads.data ?? []

  return (
    <Group title="Question source">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SOURCES.map((s) => (
          <Tile
            key={s.value}
            name="source"
            checked={value.source === s.value}
            onChange={() => onChange({ ...value, source: s.value })}
            className="justify-center font-semibold"
          >
            {s.label}
          </Tile>
        ))}
        {/* Only offered once she has uploaded a file that added questions. */}
        {uploadList.length > 0 && (
          <Tile
            name="source"
            checked={value.source === 'upload'}
            onChange={() => onChange({ ...value, source: 'upload', uploadId: value.uploadId ?? uploadList[0].id })}
            className="justify-center font-semibold"
          >
            One upload
          </Tile>
        )}
      </div>

      {value.source === 'upload' && (
        <>
          <Label htmlFor="upload" className="sr-only">
            Uploaded file
          </Label>
          <NativeSelect
            id="upload"
            value={value.uploadId ?? ''}
            onChange={(e) => onChange({ ...value, uploadId: e.target.value || null })}
            className="h-12 rounded-lg bg-card"
          >
            {uploadList.map((u) => (
              <option key={u.id} value={u.id}>
                {uploadLabel(u)}
              </option>
            ))}
          </NativeSelect>
        </>
      )}

      <label className="flex min-h-11 cursor-pointer items-center gap-3 pt-1">
        <input
          type="checkbox"
          checked={value.verifiedOnly}
          onChange={(e) => onChange({ ...value, verifiedOnly: e.target.checked })}
          className="size-5 shrink-0 accent-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
        />
        <span>
          <span className="font-semibold">Verified only</span>
          <span className="block text-sm text-muted-foreground">Skip questions you haven’t checked yet</span>
        </span>
      </label>
    </Group>
  )
}
