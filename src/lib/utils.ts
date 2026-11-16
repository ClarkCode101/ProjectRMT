import { createCn } from 'cn/config'

/**
 * Joins class names and drops the ones a later class overrides (clsx + tailwind-merge in one).
 * It is told about the cartoon "sticker" shadows from index.css (shadow-toon, shadow-toon-sm), so that e.g.
 * cn('shadow-toon', 'shadow-none') keeps only shadow-none. Without this it kept both, and the shadow stayed.
 */
export const cn = createCn({
  extend: { classGroups: { shadow: [{ shadow: ['toon', 'toon-sm'] }] } },
})
