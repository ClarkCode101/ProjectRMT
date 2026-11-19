import { DevPanel, type DevAction } from '@/components/DevPanel'
import { taskKey } from '@/lib/planLinks'
import { PLAN_STORAGE_KEYS, recordPlanProgress, recordPlanResult } from '@/lib/planProgress'
import { devSummary, NO_DEV, readPlanDev, writePlanDev, type PlanDev } from './planDev'
import type { PlanRow } from './planText'
import { clearRecapSeen } from './recapSeen'
import type { TodaysPlan } from './useTodaysPlan'

/** The real weekday (0 = Sunday), read when a shortcut is tapped. */
const realWeekday = () => new Date().getDay()

/** Today's plan and progress on this device: cleared so a new plan is made (for the pretend day). */
function clearTodaysPlan() {
  try {
    PLAN_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key))
  } catch {
    // storage blocked
  }
}

/**
 * Pretend she did a task (on this device only): its progress, and a made-up result (70% right; half of the
 * past mistakes fixed), so "What you learned today" has something to show. A Mock exam: "finished one today".
 */
function markDone(row: PlanRow, now: Date, dev: PlanDev): PlanDev {
  const { task } = row
  if (task.kind === 'mock') return { ...dev, mockDone: true }
  const key = taskKey(task)
  recordPlanProgress(key, row.items - row.done, now)
  const total = task.count
  recordPlanResult(key, { correct: Math.round(total * 0.7), total, fixed: task.kind === 'mistakes' ? Math.round(total / 2) : 0 }, now)
  return dev
}

/**
 * DEV ONLY (npm run dev): the red DEV button on the Plan page. A pretend date and pretend situations, to test
 * every state of the plan without waiting for days. Nothing here writes to the database: only this device.
 * Each shortcut reloads the page, since the plan reads the date and its data once when the page opens.
 */
export function PlanDevPanel({ today }: { today: TodaysPlan }) {
  const dev = readPlanDev()
  const set = (next: PlanDev, newPlan = true) => {
    writePlanDev(next)
    if (newPlan) clearTodaysPlan()
    window.location.reload()
  }
  const scenario = (s: PlanDev['scenario']) => set({ ...dev, scenario: dev.scenario === s ? null : s })

  const actions: DevAction[] = [
    { label: 'Date: +1 day', onClick: () => set({ ...dev, dayOffset: dev.dayOffset + 1, mockDone: false }) },
    { label: 'Date: −1 day', onClick: () => set({ ...dev, dayOffset: dev.dayOffset - 1, mockDone: false }) },
    // Next Monday: a new week, so the weekly recap shows (cleared "seen" too).
    {
      label: 'Date: next Monday (weekly recap)',
      onClick: () => {
        clearRecapSeen()
        set({ ...dev, dayOffset: (8 - realWeekday()) % 7 || 7, mockDone: false })
      },
    },
    { label: 'Date: this Sunday', onClick: () => set({ ...dev, dayOffset: (7 - realWeekday()) % 7, mockDone: false }) },
    { label: 'Date: back to the real date', onClick: () => set({ ...dev, dayOffset: 0, mockDone: false }) },
    { label: 'Today = Full day', onClick: () => set({ ...dev, mode: 'full' }) },
    { label: 'Today = Light day', onClick: () => set({ ...dev, mode: 'light' }) },
    { label: 'Today = Rest day', onClick: () => set({ ...dev, mode: 'rest' }) },
    { label: 'Today = my saved choice', onClick: () => set({ ...dev, mode: null }) },
    { label: `${dev.scenario === 'comeback' ? '✓ ' : ''}Comeback (away 3 days)`, onClick: () => scenario('comeback') },
    { label: `${dev.scenario === 'simulate' ? '✓ ' : ''}Simulate (exam in 15 days)`, onClick: () => scenario('simulate') },
    { label: `${dev.scenario === 'new' ? '✓ ' : ''}New member (no answers)`, onClick: () => scenario('new') },
    {
      label: 'Mark the next task done',
      onClick: () => {
        if (today.current) set(markDone(today.current, today.now, dev), false)
      },
    },
    {
      label: 'Mark all tasks done',
      onClick: () => {
        let next = dev
        for (const row of today.rows) if (!row.complete) next = markDone(row, today.now, next)
        set(next, false)
      },
    },
    { label: 'Make today’s plan again', onClick: () => set({ ...dev, mockDone: false }) },
    {
      label: 'Show the weekly recap again',
      onClick: () => {
        clearRecapSeen()
        window.location.reload()
      },
    },
    { label: 'Clear all DEV (back to real)', onClick: () => set(NO_DEV) },
  ]

  return <DevPanel where={`Plan · ${devSummary(dev, today.now)} · tasks you START save real answers (on the real date)`} actions={actions} align="right" />
}
