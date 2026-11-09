import { describe, expect, it } from 'vitest'
import { isIosDevice, pickInstallMode } from './install'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
// iPadOS 13+ Safari pretends to be a Mac by default.
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

describe('isIosDevice', () => {
  it('spots an iPhone', () => {
    expect(isIosDevice(IPHONE, 5)).toBe(true)
  })

  it('spots an iPad that says it is a Mac, by its touch screen', () => {
    expect(isIosDevice(IPAD_AS_MAC, 5)).toBe(true)
  })

  it('does not mistake a real Mac (no touch) for an iPad', () => {
    expect(isIosDevice(IPAD_AS_MAC, 0)).toBe(false)
  })

  it('is false for Android and Windows', () => {
    expect(isIosDevice(ANDROID, 5)).toBe(false)
    expect(isIosDevice(WINDOWS, 0)).toBe(false)
  })
})

describe('pickInstallMode', () => {
  it('is "installed" when opened from the Home Screen, even if other signs are there', () => {
    expect(pickInstallMode({ standalone: true, canPrompt: true, ios: true })).toBe('installed')
  })

  it('uses the real Install button when the browser offers one', () => {
    expect(pickInstallMode({ standalone: false, canPrompt: true, ios: false })).toBe('prompt')
  })

  it('shows the Share steps on iPhone and iPad', () => {
    expect(pickInstallMode({ standalone: false, canPrompt: false, ios: true })).toBe('ios')
  })

  it('falls back to "manual" everywhere else', () => {
    expect(pickInstallMode({ standalone: false, canPrompt: false, ios: false })).toBe('manual')
  })
})
