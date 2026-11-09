import { describe, expect, it } from 'vitest'
import { communityErrorMessage, filterCommunityBooks, GENERAL_ERROR, sortCommunityBooks, subjectsInUse, timesAddedLabel, type CommunityBook } from './community'

function book(changes: Partial<CommunityBook>): CommunityBook {
  return {
    id: 'b1',
    title: 'Hema week 3',
    color: 'teal',
    authorName: 'Ana',
    publishedAt: '2026-11-01T00:00:00Z',
    questionCount: 10,
    subjectCodes: ['HEMA'],
    timesAdded: 0,
    isMine: false,
    myCopyId: null,
    ...changes,
  }
}

describe('filterCommunityBooks', () => {
  const books = [
    book({ id: 'a', title: 'Hema week 3', authorName: 'Ana', subjectCodes: ['HEMA'] }),
    book({ id: 'b', title: 'Enzymes cram', authorName: 'Joy Dela Cruz', subjectCodes: ['CC', 'HEMA'] }),
    book({ id: 'c', title: 'My own notes', authorName: 'Mark', subjectCodes: [] }),
  ]
  const ids = (list: CommunityBook[]) => list.map((b) => b.id)

  it('shows everything with no search and no subject', () => {
    expect(ids(filterCommunityBooks(books, { search: '', subject: null }))).toEqual(['a', 'b', 'c'])
    expect(ids(filterCommunityBooks(books, { search: '   ', subject: null }))).toEqual(['a', 'b', 'c'])
  })

  it('matches the title or the author, ignoring capitals and extra spaces', () => {
    expect(ids(filterCommunityBooks(books, { search: '  ENZYMES ', subject: null }))).toEqual(['b'])
    expect(ids(filterCommunityBooks(books, { search: 'dela   cruz', subject: null }))).toEqual(['b'])
  })

  it('needs every word to match, in any order', () => {
    expect(ids(filterCommunityBooks(books, { search: 'week hema', subject: null }))).toEqual(['a'])
    expect(ids(filterCommunityBooks(books, { search: 'hema joy', subject: null }))).toEqual([])
  })

  it('keeps only books with questions from the chosen subject', () => {
    expect(ids(filterCommunityBooks(books, { search: '', subject: 'HEMA' }))).toEqual(['a', 'b'])
    expect(ids(filterCommunityBooks(books, { search: '', subject: 'MICRO' }))).toEqual([])
  })

  it('uses the search and the subject together', () => {
    expect(ids(filterCommunityBooks(books, { search: 'cram', subject: 'HEMA' }))).toEqual(['b'])
    expect(ids(filterCommunityBooks(books, { search: 'notes', subject: 'HEMA' }))).toEqual([])
  })
})

describe('sortCommunityBooks', () => {
  const old = book({ id: 'old', publishedAt: '2026-10-01T00:00:00Z', timesAdded: 5 })
  const mid = book({ id: 'mid', publishedAt: '2026-10-15T00:00:00Z', timesAdded: 5 })
  const recent = book({ id: 'new', publishedAt: '2026-11-01T00:00:00Z', timesAdded: 1 })
  const list = [old, recent, mid]

  it('puts the newest first', () => {
    expect(sortCommunityBooks(list, 'newest').map((b) => b.id)).toEqual(['new', 'mid', 'old'])
  })

  it('puts the most added first, and the newer one first when tied', () => {
    expect(sortCommunityBooks(list, 'popular').map((b) => b.id)).toEqual(['mid', 'old', 'new'])
  })

  it('does not change the list it is given', () => {
    sortCommunityBooks(list, 'newest')
    expect(list.map((b) => b.id)).toEqual(['old', 'new', 'mid'])
  })

  it('handles an empty list', () => {
    expect(sortCommunityBooks([], 'popular')).toEqual([])
  })
})

describe('subjectsInUse', () => {
  it('lists the subjects some book has, in the app order', () => {
    const books = [book({ subjectCodes: ['HEMA', 'CC'] }), book({ subjectCodes: ['CC'] }), book({ subjectCodes: [] })]
    expect(subjectsInUse(books, ['CC', 'MICRO', 'HEMA', 'BBIS'])).toEqual(['CC', 'HEMA'])
  })

  it('is empty when nothing is shared', () => {
    expect(subjectsInUse([], ['CC', 'HEMA'])).toEqual([])
  })
})

describe('timesAddedLabel', () => {
  it('reads naturally for 0, 1 and more', () => {
    expect(timesAddedLabel(0)).toBe('Not added yet')
    expect(timesAddedLabel(1)).toBe('Added once')
    expect(timesAddedLabel(12)).toBe('Added 12 times')
  })
})

describe('communityErrorMessage', () => {
  it('shows the messages the database raises on purpose as they are', () => {
    expect(communityErrorMessage({ message: 'That library is full. Pick another one or make room first.' })).toBe(
      'That library is full. Pick another one or make room first.',
    )
    expect(communityErrorMessage({ message: 'This book is already in your library.' })).toBe('This book is already in your library.')
  })

  it('shows the general message for anything else', () => {
    expect(communityErrorMessage({ message: 'TypeError: Failed to fetch' })).toBe(GENERAL_ERROR)
    expect(communityErrorMessage(new Error('boom'))).toBe(GENERAL_ERROR)
    expect(communityErrorMessage(null)).toBe(GENERAL_ERROR)
    expect(communityErrorMessage('a string')).toBe(GENERAL_ERROR)
  })
})
