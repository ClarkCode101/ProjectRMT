// Turns reviewer text (from a PDF, DOCX or pasted text) into multiple-choice questions.
// PROJECT_PLAN.md §8. Pure functions only, so every format below is covered by tests.
//
// Formats it understands:
//   1. Which factor is the stable factor?        (also "1)", "Q1.", "Question 1:")
//   A. Factor V                                  (also "a)", "(a)", "A -", or all on one line,
//   B. Factor VII                                 or right after the question on the same line)
//   C. Factor VIII
//   D. Factor X
//   Answer: B                                    (also "Ans: b", "Correct answer - B")
//   Explanation: Factor VII is ...               (also "Rationale:"; can run over several lines)
// The correct choice can also be marked with * (e.g. "*B. Factor VII" or "B. Factor VII *"),
// or listed in an answer key at the end ("ANSWER KEY" then "1. B  2. C" / "1-B" ...).

export type ParsedQuestion = {
  /** the number written in the source, if any */
  number: number | null
  stem: string
  choices: string[]
  /** index into choices, or null when no answer was found */
  correctIndex: number | null
  explanation: string
  /** what is wrong with this one; empty = ready to save */
  problems: string[]
}

export type ParseResult = {
  questions: ParsedQuestion[]
  /** text before the first question (titles, instructions), shown so nothing disappears silently */
  skippedText: string
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const REQUIRED_CHOICES = 4

/** Same cleanup the database uses for duplicate checks (questions.normalized_stem). */
export function normalizeStem(stem: string): string {
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const QUESTION_START = /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.):]\s*(.*)$/i
const CHOICE_LINE = /^(\*?)\s*(?:\(([a-f])\)|([a-f])\s*[.)]|([a-f])\s+[-–:])\s*(.*)$/i
const ANSWER_LINE = /^(?:correct\s+)?(?:answer|ans)(?:\s*key)?\s*[:.\-–=]?\s*\(?([a-f])\)?(?=[\s.):,]|$)/i
// "Answer:" alone on a line; the letter comes on the next line.
const ANSWER_LABEL_ONLY = /^(?:correct\s+)?(?:answer|ans)\s*[:.\-–=]?\s*$/i
const LONE_LETTER = /^\(?([a-f])\)?(?=[\s.):,]|$)/i
const EXPLANATION_LINE = /^(?:explanation|rationale|reason)\s*[:.\-–]\s*(.*)$/i
// Plural "Answers" only: a lone "Answer:" line is a question's answer label, not a key heading.
const KEY_HEADING = /^(?:answer\s*key|answers|key\s+to\s+corrections?|answer\s+sheet)\s*:?\s*$/i
const KEY_PAIR = /(\d{1,3})\s*[.):\-–=]?\s*\(?([a-f])\)?(?![a-z])/gi
const CORRECT_MARK = /\s*(?:\*|\(correct\))\s*$/i

function cleanLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/^[•●▪◦·-]\s+/, '').replace(/\s+/g, ' ').trim())
}

/**
 * Splits a line with several choices on it ("A. x B. y C. z D. w"),
 * or a question with its choices on the same line ("1. Stem? a) x b) y").
 * Only splits when the letters come in order (A then B then C), so normal sentences stay whole.
 */
function splitInlineChoices(line: string): string[] {
  for (const style of ['upper', 'lower'] as const) {
    const letters = style === 'upper' ? LETTERS : LETTERS.map((l) => l.toLowerCase())
    const marker = (letter: string) => new RegExp(`(^|\\s)(\\*?\\(?${letter}[.)])\\s`)
    const first = marker(letters[0]).exec(line)
    const second = marker(letters[1]).exec(line)
    if (!first || !second || second.index <= first.index) continue

    const parts: string[] = []
    let rest = line
    let cut = first.index + first[1].length
    if (cut > 0) parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut)
    for (let i = 1; i < letters.length; i++) {
      const next = marker(letters[i]).exec(rest)
      if (!next || next.index === 0) break
      cut = next.index + next[1].length
      parts.push(rest.slice(0, cut).trim())
      rest = rest.slice(cut)
    }
    parts.push(rest.trim())
    return parts.filter(Boolean)
  }
  return [line]
}

type Draft = {
  number: number | null
  stemLines: string[]
  choices: string[]
  markedIndex: number | null
  answerLetter: string | null
  explanationLines: string[]
  mode: 'stem' | 'choices' | 'awaitAnswer' | 'explanation'
}

function newDraft(number: number | null, firstLine: string): Draft {
  return { number, stemLines: firstLine ? [firstLine] : [], choices: [], markedIndex: null, answerLetter: null, explanationLines: [], mode: 'stem' }
}

/** Reads an answer key: "1. B 2. C", "1-b", "1) (c)" ... Returns question number → letter. */
export function parseAnswerKey(text: string): Map<number, string> {
  const key = new Map<number, string>()
  for (const match of text.matchAll(KEY_PAIR)) key.set(Number(match[1]), match[2].toUpperCase())
  return key
}

export function parseQuestions(text: string): ParseResult {
  const lines = cleanLines(text).flatMap(splitInlineChoices)

  // An answer key at the end: everything after its heading is key, not questions.
  const keyStart = lines.findIndex((line) => KEY_HEADING.test(line))
  const body = keyStart === -1 ? lines : lines.slice(0, keyStart)
  const answerKey = keyStart === -1 ? new Map<number, string>() : parseAnswerKey(lines.slice(keyStart + 1).join(' '))

  const drafts: Draft[] = []
  const skipped: string[] = []
  let current: Draft | null = null

  for (const line of body) {
    if (!line) continue

    const start = QUESTION_START.exec(line)
    if (start) {
      const rest = start[2].trim()
      // "12. B" on its own line is an answer key entry, not a question.
      if (/^\(?[a-f]\)?$/i.test(rest)) {
        answerKey.set(Number(start[1]), rest.replace(/[()]/g, '').toUpperCase())
        continue
      }
      current = newDraft(Number(start[1]), rest)
      drafts.push(current)
      continue
    }
    if (!current) {
      skipped.push(line)
      continue
    }

    if (current.mode === 'awaitAnswer') {
      const lone = LONE_LETTER.exec(line)
      current.mode = 'explanation'
      if (lone) {
        current.answerLetter = lone[1].toUpperCase()
        const after = line.slice(lone[0].length).replace(/^[\s.):,-]+/, '')
        if (after) current.explanationLines.push(after)
        continue
      }
    }

    if (ANSWER_LABEL_ONLY.test(line)) {
      current.mode = 'awaitAnswer'
      continue
    }

    const answer = ANSWER_LINE.exec(line)
    if (answer) {
      current.answerLetter = answer[1].toUpperCase()
      // Anything after "Answer: B." on the same line is usually the reason.
      const after = line.slice(answer[0].length).replace(/^[\s.):,-]+/, '')
      if (after) current.explanationLines.push(after)
      current.mode = 'explanation'
      continue
    }

    // "Answer: Both are wrong" has no letter to use; keep it as part of the explanation, not the last choice.
    if (/^(?:correct\s+)?(?:answer|ans)\b/i.test(line)) {
      current.explanationLines.push(line)
      current.mode = 'explanation'
      continue
    }

    const explanation = EXPLANATION_LINE.exec(line)
    if (explanation) {
      if (explanation[1]) current.explanationLines.push(explanation[1])
      current.mode = 'explanation'
      continue
    }

    const choice = current.mode !== 'explanation' ? CHOICE_LINE.exec(line) : null
    const letter = choice ? (choice[2] ?? choice[3] ?? choice[4]).toUpperCase() : null
    // Only the next letter in order counts as a choice (so "A." inside a sentence doesn't).
    if (choice && letter === LETTERS[current.choices.length]) {
      let choiceText = choice[5].trim()
      const marked = choice[1] === '*' || CORRECT_MARK.test(choiceText)
      choiceText = choiceText.replace(CORRECT_MARK, '').trim()
      if (marked) current.markedIndex = current.choices.length
      current.choices.push(choiceText)
      current.mode = 'choices'
      continue
    }

    // A plain line continues whatever came before it.
    if (current.mode === 'stem') current.stemLines.push(line)
    else if (current.mode === 'choices') current.choices[current.choices.length - 1] += ` ${line}`
    else current.explanationLines.push(line)
  }

  const questions = drafts.map((d): ParsedQuestion => {
    const letter = d.answerLetter ?? (d.number !== null ? answerKey.get(d.number) : undefined) ?? null
    let correctIndex: number | null = d.markedIndex
    const problems: string[] = []
    if (letter !== null) {
      const index = LETTERS.indexOf(letter)
      if (index < d.choices.length) correctIndex = index
      else problems.push(`The answer is ${letter}, but there is no choice ${letter}.`)
    }

    const stem = d.stemLines.join(' ').trim()
    if (!stem) problems.unshift('The question text is missing.')
    if (d.choices.length === 0) problems.push('No choices were found.')
    else if (d.choices.length !== REQUIRED_CHOICES) problems.push(`Found ${d.choices.length} choices. Each question needs exactly 4.`)
    if (correctIndex === null && letter === null) problems.push('No answer was found. Mark the correct choice.')

    return { number: d.number, stem, choices: d.choices, correctIndex, explanation: d.explanationLines.join(' ').trim(), problems }
  })

  return { questions, skippedText: skipped.join('\n') }
}
