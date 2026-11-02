// Reads every supabase/seed/questions/*.json file, validates it, and writes
// supabase/seed/02_questions.sql. Run with: npm run seed:sql
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { questionsToSql, validateSeedQuestion, type SeedQuestion } from '../src/lib/seedSql.ts'

const dir = join(import.meta.dirname, '..', 'supabase', 'seed', 'questions')
const outFile = join(import.meta.dirname, '..', 'supabase', 'seed', '02_questions.sql')

const all: SeedQuestion[] = []
let hasErrors = false

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const items: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  if (!Array.isArray(items)) {
    console.error(`${file}: top level must be an array`)
    hasErrors = true
    continue
  }
  items.forEach((item, i) => {
    const errors = validateSeedQuestion(item)
    if (errors.length > 0) {
      console.error(`${file} #${i + 1}: ${errors.join('; ')}`)
      hasErrors = true
    } else {
      all.push(item as SeedQuestion)
    }
  })
}

if (hasErrors) {
  console.error('Fix the errors above, then run again. Nothing was written.')
  process.exit(1)
}

writeFileSync(outFile, questionsToSql(all))
console.log(`Wrote ${all.length} questions to ${outFile}`)
