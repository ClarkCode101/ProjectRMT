// Reads every supabase/seed/questions/*.json file, validates it, and writes one
// SQL file per subject: supabase/seed/questions/cc.json -> supabase/seed/02_questions_cc.sql.
// Run with: npm run seed:sql
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { questionsToSql, validateSeedQuestion, type SeedQuestion } from '../src/lib/seedSql.ts'

const seedDir = join(import.meta.dirname, '..', 'supabase', 'seed')
const dir = join(seedDir, 'questions')

// First check every file, so nothing is written if any file has a problem.
const bySubjectFile = new Map<string, SeedQuestion[]>()
let hasErrors = false

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const items: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  if (!Array.isArray(items)) {
    console.error(`${file}: top level must be an array`)
    hasErrors = true
    continue
  }
  const valid: SeedQuestion[] = []
  items.forEach((item, i) => {
    const errors = validateSeedQuestion(item)
    if (errors.length > 0) {
      console.error(`${file} #${i + 1}: ${errors.join('; ')}`)
      hasErrors = true
    } else {
      valid.push(item as SeedQuestion)
    }
  })
  bySubjectFile.set(file.replace(/\.json$/, ''), valid)
}

if (hasErrors) {
  console.error('Fix the errors above, then run again. Nothing was written.')
  process.exit(1)
}

// Remove old generated files so a deleted JSON file does not leave a stale SQL file behind.
for (const f of readdirSync(seedDir)) {
  if (f === '02_questions.sql' || /^02_questions_.+\.sql$/.test(f)) unlinkSync(join(seedDir, f))
}

let total = 0
for (const [name, questions] of bySubjectFile) {
  const outFile = join(seedDir, `02_questions_${name}.sql`)
  writeFileSync(outFile, questionsToSql(questions))
  console.log(`Wrote ${questions.length} questions to ${outFile}`)
  total += questions.length
}
console.log(`Total: ${total} questions in ${bySubjectFile.size} files`)
