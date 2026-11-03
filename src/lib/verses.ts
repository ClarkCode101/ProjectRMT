// Verse of the day on Home.
// Text is from the World English Bible (WEB), which is public domain, so it is free to use and show.
// (NIV, ESV, NLT and most other modern translations are copyrighted.)
// To add a verse: copy it word for word from the WEB and add it to the list. The order doesn't matter.

export type Verse = { text: string; reference: string }

export const VERSES: readonly Verse[] = [
  { reference: 'Philippians 4:13', text: 'I can do all things through Christ, who strengthens me.' },
  {
    reference: 'Philippians 4:6–7',
    text: 'In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God. And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.',
  },
  {
    reference: 'Isaiah 41:10',
    text: 'Don’t you be afraid, for I am with you. Don’t be dismayed, for I am your God. I will strengthen you. Yes, I will help you. Yes, I will uphold you with the right hand of my righteousness.',
  },
  {
    reference: 'Joshua 1:9',
    text: 'Haven’t I commanded you? Be strong and courageous. Don’t be afraid. Don’t be dismayed, for Yahweh your God is with you wherever you go.',
  },
  {
    reference: 'Proverbs 3:5–6',
    text: 'Trust in Yahweh with all your heart, and don’t lean on your own understanding. In all your ways acknowledge him, and he will make your paths straight.',
  },
  {
    reference: 'Jeremiah 29:11',
    text: '“For I know the thoughts that I think toward you,” says Yahweh, “thoughts of peace, and not of evil, to give you hope and a future.”',
  },
  {
    reference: 'James 1:5',
    text: 'But if any of you lacks wisdom, let him ask of God, who gives to all liberally and without reproach, and it will be given to him.',
  },
  { reference: 'Colossians 3:23', text: 'And whatever you do, work heartily, as for the Lord, and not for men.' },
  { reference: 'Galatians 6:9', text: 'Let’s not be weary in doing good, for we will reap in due season if we don’t give up.' },
  {
    reference: 'Isaiah 40:31',
    text: 'But those who wait for Yahweh will renew their strength. They will mount up with wings like eagles. They will run, and not be weary. They will walk, and not faint.',
  },
  { reference: 'Proverbs 16:3', text: 'Commit your deeds to Yahweh, and your plans shall succeed.' },
  { reference: 'Psalm 46:1', text: 'God is our refuge and strength, a very present help in trouble.' },
  { reference: '2 Timothy 1:7', text: 'For God didn’t give us a spirit of fear, but of power, love, and self-control.' },
  { reference: 'Matthew 11:28', text: 'Come to me, all you who labor and are heavily burdened, and I will give you rest.' },
  { reference: '1 Peter 5:7', text: 'Casting all your worries on him, because he cares for you.' },
  {
    reference: 'Psalm 121:1–2',
    text: 'I will lift up my eyes to the hills. Where does my help come from? My help comes from Yahweh, who made heaven and earth.',
  },
  {
    reference: 'Romans 8:28',
    text: 'We know that all things work together for good for those who love God, for those who are called according to his purpose.',
  },
  { reference: 'Proverbs 2:6', text: 'For Yahweh gives wisdom. Out of his mouth comes knowledge and understanding.' },
  {
    reference: 'Lamentations 3:22–23',
    text: 'It is because of Yahweh’s loving kindnesses that we are not consumed, because his mercies don’t fail. They are new every morning. Great is your faithfulness.',
  },
  { reference: 'Psalm 118:24', text: 'This is the day that Yahweh has made. We will rejoice and be glad in it!' },
  { reference: 'Proverbs 18:15', text: 'The heart of the discerning gets knowledge. The ear of the wise seeks knowledge.' },
  { reference: 'Psalm 90:12', text: 'So teach us to count our days, that we may gain a heart of wisdom.' },
]

const DAY_MS = 24 * 60 * 60 * 1000

/** The same verse all day (in her own time zone), a different one tomorrow. */
export function verseOfTheDay(date: Date, verses: readonly Verse[] = VERSES): Verse {
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS)
  return verses[dayNumber % verses.length]
}
