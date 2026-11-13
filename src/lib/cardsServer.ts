// Everything the Edge Function `cards-game` runs, in one place: the live game (cardsLive.ts) and its DEV shortcuts
// (cardsLiveDev.ts). `npm run build:cards-rules` bundles this file into supabase/functions/cards-game/rules.js.
export * from './cardsLive'
export * from './cardsLiveDev'
