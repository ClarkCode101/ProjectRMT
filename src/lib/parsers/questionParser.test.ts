import { describe, expect, it } from 'vitest'
import { normalizeStem, parseAnswerKey, parseQuestions } from './questionParser'

describe('normalizeStem', () => {
  it('lowercases, drops punctuation and squeezes spaces', () => {
    expect(normalizeStem('  Which  Factor is “stable”?\nFactor-VII ')).toBe('which factor is stable factor vii')
  })
})

describe('parseQuestions: the standard format', () => {
  const text = `
HEMATOLOGY REVIEWER
Choose the best answer.

1. Which coagulation factor is known as the stable factor?
A. Factor V
B. Factor VII
C. Factor VIII
D. Factor X
Answer: B
Explanation: Factor VII is stable in stored plasma.

2. The normal lifespan of a red blood cell is about
A. 30 days
B. 60 days
C. 120 days
D. 365 days
Answer: C
`
  const result = parseQuestions(text)

  it('finds every question with its choices, answer and explanation', () => {
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0]).toEqual({
      number: 1,
      stem: 'Which coagulation factor is known as the stable factor?',
      choices: ['Factor V', 'Factor VII', 'Factor VIII', 'Factor X'],
      correctIndex: 1,
      explanation: 'Factor VII is stable in stored plasma.',
      problems: [],
    })
    expect(result.questions[1]).toMatchObject({ number: 2, correctIndex: 2, explanation: '', problems: [] })
  })

  it('keeps the title and instructions as skipped text', () => {
    expect(result.skippedText).toBe('HEMATOLOGY REVIEWER\nChoose the best answer.')
  })
})

describe('parseQuestions: other common layouts', () => {
  it('reads lowercase a) choices, "1)" numbers and "Ans:"', () => {
    const [q] = parseQuestions('1) Glucose is measured in\na) mg/dL\nb) g/L\nc) IU/L\nd) mEq/L\nAns: a').questions
    expect(q.choices).toEqual(['mg/dL', 'g/L', 'IU/L', 'mEq/L'])
    expect(q.correctIndex).toBe(0)
    expect(q.problems).toEqual([])
  })

  it('reads (a) style choices and "Q1." numbers', () => {
    const [q] = parseQuestions('Q1. Pick one\n(a) one\n(b) two\n(c) three\n(d) four\nAnswer - (d)').questions
    expect(q.number).toBe(1)
    expect(q.choices).toEqual(['one', 'two', 'three', 'four'])
    expect(q.correctIndex).toBe(3)
  })

  it('splits choices written on one line', () => {
    const [q] = parseQuestions('3. Pick one\nA. red B. green C. blue D. white\nAnswer: C').questions
    expect(q.choices).toEqual(['red', 'green', 'blue', 'white'])
    expect(q.correctIndex).toBe(2)
  })

  it('splits choices that follow the question on the same line', () => {
    const [q] = parseQuestions('4. Which is a ketone body? a) acetone b) glucose c) urea d) uric acid\nAnswer: a').questions
    expect(q.stem).toBe('Which is a ketone body?')
    expect(q.choices).toEqual(['acetone', 'glucose', 'urea', 'uric acid'])
  })

  it('joins a question that runs over several lines', () => {
    const [q] = parseQuestions('5. A patient has low hemoglobin\nand small pale red cells. This suggests\nA. iron deficiency\nB. B12 deficiency\nC. folate deficiency\nD. hemolysis\nAnswer: A').questions
    expect(q.stem).toBe('A patient has low hemoglobin and small pale red cells. This suggests')
  })

  it('uses a * mark or "(correct)" as the answer', () => {
    expect(parseQuestions('1. X\nA. a\n*B. b\nC. c\nD. d').questions[0].correctIndex).toBe(1)
    expect(parseQuestions('1. X\nA. a\nB. b\nC. c *\nD. d').questions[0]).toMatchObject({ correctIndex: 2, choices: ['a', 'b', 'c', 'd'] })
    expect(parseQuestions('1. X\nA. a\nB. b\nC. c\nD. d (correct)').questions[0]).toMatchObject({ correctIndex: 3, choices: ['a', 'b', 'c', 'd'] })
  })

  it('reads the answer letter on the line after "Answer:"', () => {
    const [q] = parseQuestions('1. X\nA. a\nB. b\nC. c\nD. d\nAnswer:\nD').questions
    expect(q.correctIndex).toBe(3)
  })

  it('keeps the reason written after the answer letter', () => {
    const [q] = parseQuestions('1. X\nA. a\nB. b\nC. c\nD. d\nAnswer: B. Because b is right.\nIt is in every book.').questions
    expect(q.correctIndex).toBe(1)
    expect(q.explanation).toBe('Because b is right. It is in every book.')
  })

  it('does not treat "Answer: Both" as answer B', () => {
    const [q] = parseQuestions('1. X\nA. a\nB. b\nC. c\nD. d\nAnswer: Both are wrong').questions
    expect(q.correctIndex).toBeNull()
    expect(q.choices[3]).toBe('d') // not glued onto the last choice
    expect(q.explanation).toBe('Answer: Both are wrong')
  })

  it('ignores bullets and extra spaces from copied text', () => {
    const [q] = parseQuestions('1.   Spaced    out\n•  A.  one\n•  B.  two\n• C. three\n• D. four\nAnswer: B').questions
    expect(q.stem).toBe('Spaced out')
    expect(q.choices).toEqual(['one', 'two', 'three', 'four'])
  })
})

describe('parseQuestions: answer keys', () => {
  it('uses an ANSWER KEY section at the end', () => {
    const text = '1. One?\nA. a\nB. b\nC. c\nD. d\n2. Two?\nA. a\nB. b\nC. c\nD. d\n\nANSWER KEY\n1. C 2. a'
    const { questions } = parseQuestions(text)
    expect(questions.map((q) => q.correctIndex)).toEqual([2, 0])
    expect(questions.every((q) => q.problems.length === 0)).toBe(true)
  })

  it('treats "12. B" lines as key entries even without a heading', () => {
    const text = '1. One?\nA. a\nB. b\nC. c\nD. d\n\n1. D'
    const { questions } = parseQuestions(text)
    expect(questions).toHaveLength(1)
    expect(questions[0].correctIndex).toBe(3)
  })

  it('parses many key styles', () => {
    expect([...parseAnswerKey('1. B 2-c 3) (d) 10:A')]).toEqual([
      [1, 'B'],
      [2, 'C'],
      [3, 'D'],
      [10, 'A'],
    ])
  })

  it('prefers the answer written under the question over the key', () => {
    const { questions } = parseQuestions('1. One?\nA. a\nB. b\nC. c\nD. d\nAnswer: A\nANSWER KEY\n1. B')
    expect(questions[0].correctIndex).toBe(0)
  })
})

describe('parseQuestions: problems to fix by hand', () => {
  it('flags a missing answer', () => {
    const [q] = parseQuestions('1. X\nA. a\nB. b\nC. c\nD. d').questions
    expect(q.correctIndex).toBeNull()
    expect(q.problems).toEqual(['No answer was found. Mark the correct choice.'])
  })

  it('flags 5 choices (only 4 allowed) but still reads them', () => {
    const [q] = parseQuestions('1. X\nA. a\nB. b\nC. c\nD. d\nE. e\nAnswer: E').questions
    expect(q.choices).toHaveLength(5)
    expect(q.correctIndex).toBe(4)
    expect(q.problems).toEqual(['Found 5 choices. Each question needs exactly 4.'])
  })

  it('flags an answer letter with no matching choice', () => {
    const [q] = parseQuestions('1. X\nA. a\nB. b\nC. c\nAnswer: D').questions
    expect(q.correctIndex).toBeNull()
    expect(q.problems).toContain('The answer is D, but there is no choice D.')
    expect(q.problems).toContain('Found 3 choices. Each question needs exactly 4.')
  })

  it('flags a question with no choices', () => {
    const [q] = parseQuestions('1. Define hematocrit.').questions
    expect(q.problems).toContain('No choices were found.')
  })

  it('returns nothing for empty text', () => {
    expect(parseQuestions('   ')).toEqual({ questions: [], skippedText: '' })
  })
})
