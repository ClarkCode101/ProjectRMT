// 💌 Notes for her, written by you. Edit, add or remove lines freely, then push.
//
// When each kind shows up:
//   'mock_passed'  after a mock exam she passed (75%+)
//   'mock_done'    after a mock exam she didn't pass yet
//   'streak'       on Home, the day her streak reaches 3, 7, 14, 30, 50 or 100 days
//   'random'       now and then after a practice session (and as a backup for the others)
//
// Keep the app's text in English (the rest of the UI is English too).
// These are starter lines: replace them with your own words.
import type { Note } from '@/lib/planner'

/** Shown under each note, like a signature. Change it to however you sign your notes. */
export const SIGNED_BY = 'Clarence'

export const NOTES: Note[] = [
  { trigger: 'mock_passed', message: 'You passed! I knew you could. Every one of these is proof you’re ready.' },
  { trigger: 'mock_passed', message: 'Look at that score. All those late nights are paying off. So proud of you.' },

  { trigger: 'mock_done', message: 'A mock is practice, not a verdict. Every item you missed today is one you’ll get right on the real day.' },
  { trigger: 'mock_done', message: 'Rest a bit, then review the misses. You’re closer than you think.' },

  { trigger: 'streak', message: 'Another day, another step closer to RMT. I’m cheering for you every single day.' },
  { trigger: 'streak', message: 'Showing up every day is the hardest part, and you’re doing it. Keep going!' },

  { trigger: 'random', message: 'Drink some water and stretch. Future RMT needs her energy.' },
  { trigger: 'random', message: 'Proud of you for studying today, even on the hard days.' },
  { trigger: 'random', message: 'One question at a time. You’re doing great.' },
]
