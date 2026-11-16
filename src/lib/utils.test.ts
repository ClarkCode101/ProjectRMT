import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('lets a later shadow replace the sticker shadows', () => {
    expect(cn('shadow-toon', 'shadow-none')).toBe('shadow-none')
    expect(cn('shadow-toon-sm', 'shadow-toon')).toBe('shadow-toon')
    expect(cn('shadow-none', 'shadow-toon-sm')).toBe('shadow-toon-sm')
  })

  it('still merges ordinary Tailwind classes', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
    expect(cn('border-ink', false && 'hidden', 'border-transparent')).toBe('border-transparent')
  })
})
