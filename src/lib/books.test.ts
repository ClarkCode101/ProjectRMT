import { describe, expect, it } from 'vitest'
import {
  BOOK_TITLE_MAX,
  bookAccuracy,
  booksContaining,
  CHAPTER_MAX,
  chapterList,
  cleanBookTitle,
  cleanChapter,
  cleanLibraryName,
  defaultLibraryName,
  LIBRARY_NAME_MAX,
  LIBRARY_SLOTS,
  libraryNames,
  MAX_STARS,
  roomLeft,
  mergeTopicName,
  questionsOnlyIn,
  starsFor,
  subjectTopicList,
} from './books'

describe('cleanBookTitle', () => {
  it('trims and squeezes spaces', () => {
    expect(cleanBookTitle('  Pre-board   week 3 ')).toEqual({ title: 'Pre-board week 3' })
  })

  it('rejects an empty or blank name', () => {
    expect(cleanBookTitle('')).toHaveProperty('error')
    expect(cleanBookTitle('   \n ')).toHaveProperty('error')
  })

  it('accepts exactly the longest allowed name and rejects one letter more', () => {
    expect(cleanBookTitle('a'.repeat(BOOK_TITLE_MAX))).toEqual({ title: 'a'.repeat(BOOK_TITLE_MAX) })
    expect(cleanBookTitle('a'.repeat(BOOK_TITLE_MAX + 1))).toHaveProperty('error')
  })
})

describe('cleanLibraryName', () => {
  it('trims, and has its own shorter limit', () => {
    expect(cleanLibraryName('  Pre-boards ')).toEqual({ title: 'Pre-boards' })
    expect(cleanLibraryName('a'.repeat(LIBRARY_NAME_MAX + 1))).toHaveProperty('error')
    expect(cleanLibraryName(' ')).toHaveProperty('error')
  })
})

describe('libraryNames', () => {
  it('uses the defaults when nothing is renamed', () => {
    expect(libraryNames([])).toEqual([defaultLibraryName(1), defaultLibraryName(2), defaultLibraryName(3)])
  })

  it('puts each saved name in its own slot, whatever order they come in', () => {
    expect(libraryNames([{ slot: 3, name: 'Notes' }, { slot: 1, name: 'Boards' }])).toEqual(['Boards', defaultLibraryName(2), 'Notes'])
  })
})

describe('roomLeft', () => {
  it('counts the six subject books in Library 1 only', () => {
    expect(roomLeft(1, 0, 6)).toBe(LIBRARY_SLOTS - 6)
    expect(roomLeft(2, 0, 6)).toBe(LIBRARY_SLOTS)
  })

  it('is 0 when full, and never negative', () => {
    expect(roomLeft(2, LIBRARY_SLOTS, 6)).toBe(0)
    expect(roomLeft(1, LIBRARY_SLOTS, 6)).toBe(0)
  })
})

describe('starsFor', () => {
  it('gives no stars before she has answered anything', () => {
    expect(starsFor(null)).toBe(0)
  })

  it('earns each star exactly at its threshold (60%, 75%, 90%)', () => {
    expect(starsFor(0.59)).toBe(0)
    expect(starsFor(0.6)).toBe(1)
    expect(starsFor(0.749)).toBe(1)
    expect(starsFor(0.75)).toBe(2)
    expect(starsFor(0.9)).toBe(3)
    expect(starsFor(1)).toBe(MAX_STARS)
  })

  it('gives no stars for a score of 0', () => {
    expect(starsFor(0)).toBe(0)
  })
})

describe('bookAccuracy', () => {
  const attempts = [
    { question_id: 'q1', is_correct: true },
    { question_id: 'q1', is_correct: false },
    { question_id: 'q2', is_correct: true },
    { question_id: 'other', is_correct: false },
  ]

  it('counts only answers to questions in the book', () => {
    expect(bookAccuracy(new Set(['q1', 'q2']), attempts)).toBeCloseTo(2 / 3)
  })

  it('is null when none of its questions were answered (or the book is empty)', () => {
    expect(bookAccuracy(new Set(['q9']), attempts)).toBeNull()
    expect(bookAccuracy(new Set(), attempts)).toBeNull()
  })
})

describe('cleanChapter', () => {
  it('trims and squeezes spaces', () => {
    expect(cleanChapter('  Week 3  –  Enzymes ')).toEqual({ chapter: 'Week 3 – Enzymes' })
  })

  it('treats an empty or blank name as no chapter', () => {
    expect(cleanChapter('')).toEqual({ chapter: null })
    expect(cleanChapter('   ')).toEqual({ chapter: null })
  })

  it('rejects a name over the limit', () => {
    expect(cleanChapter('a'.repeat(CHAPTER_MAX + 1))).toHaveProperty('error')
    expect(cleanChapter('a'.repeat(CHAPTER_MAX))).toEqual({ chapter: 'a'.repeat(CHAPTER_MAX) })
  })
})

describe('chapterList', () => {
  it('counts each chapter, sorts them A–Z (numbers in order), and counts the questions with none', () => {
    const chapters = new Map<string, string | null>([
      ['q1', 'Week 10'],
      ['q2', 'Week 2'],
      ['q3', 'Week 2'],
      ['q4', null],
      ['q5', 'enzymes'],
    ])
    expect(chapterList(chapters)).toEqual({
      chapters: [
        { name: 'enzymes', count: 1 },
        { name: 'Week 2', count: 2 },
        { name: 'Week 10', count: 1 },
      ],
      unfiled: 1,
    })
  })

  it('is empty for an empty book', () => {
    expect(chapterList(new Map())).toEqual({ chapters: [], unfiled: 0 })
  })
})

describe('booksContaining', () => {
  const books = [
    { id: 'a', questionIds: new Set(['q1', 'q2']) },
    { id: 'b', questionIds: new Set(['q2']) },
    { id: 'c', questionIds: new Set<string>() },
  ]

  it('lists every book a question is in (a question can be in several)', () => {
    expect(booksContaining(books, 'q2').map((b) => b.id)).toEqual(['a', 'b'])
  })

  it('is empty for a question in no book', () => {
    expect(booksContaining(books, 'q9')).toEqual([])
  })
})

describe('mergeTopicName', () => {
  it('uses the book name as it is when it fits', () => {
    expect(mergeTopicName('Ewan')).toBe('Ewan')
  })

  it('squeezes extra spaces', () => {
    expect(mergeTopicName('  Hema   week 3 ')).toBe('Hema week 3')
  })

  it('cuts a long name to fit a topic, with no space left at the end', () => {
    const long = 'A'.repeat(CHAPTER_MAX - 1) + ' and more words after it'
    const result = mergeTopicName(long)
    expect(result.length).toBeLessThanOrEqual(CHAPTER_MAX)
    expect(result).toBe('A'.repeat(CHAPTER_MAX - 1))
  })

  it('always gives a name cleanChapter accepts', () => {
    const name = mergeTopicName('x'.repeat(60))
    expect(cleanChapter(name)).toEqual({ chapter: name })
  })
})

describe('questionsOnlyIn', () => {
  const books = [
    { id: 'b1', questionIds: new Set(['mine-only', 'mine-shared', 'mine-subject', 'builtin']) },
    { id: 'b2', questionIds: new Set(['mine-shared']) },
  ]
  const questions = [
    { id: 'mine-only', owner_id: 'me', in_subject: false }, // only in b1: deleted with it
    { id: 'mine-shared', owner_id: 'me', in_subject: false }, // also in b2: stays
    { id: 'mine-subject', owner_id: 'me', in_subject: true }, // in a subject: stays
    { id: 'builtin', owner_id: null, in_subject: true }, // built-in: never deleted
    { id: 'elsewhere', owner_id: 'me', in_subject: false }, // not in b1 at all
  ]

  it('counts only her book-only questions that are in no other book', () => {
    expect(questionsOnlyIn('b1', books, questions)).toBe(1)
  })

  it('is 0 when every question also lives somewhere else', () => {
    expect(questionsOnlyIn('b2', books, questions)).toBe(0)
  })

  it('is 0 for a book that does not exist', () => {
    expect(questionsOnlyIn('nope', books, questions)).toBe(0)
  })
})

describe('subjectTopicList', () => {
  it('counts her topics A to Z and leaves out questions without one', () => {
    const questions = [{ subject_topic: 'ewan' }, { subject_topic: null }, { subject_topic: 'Abby' }, { subject_topic: 'ewan' }]
    expect(subjectTopicList(questions)).toEqual([
      { name: 'Abby', count: 1 },
      { name: 'ewan', count: 2 },
    ])
  })

  it('is empty when she has no topics in the subject', () => {
    expect(subjectTopicList([{ subject_topic: null }])).toEqual([])
    expect(subjectTopicList([])).toEqual([])
  })
})