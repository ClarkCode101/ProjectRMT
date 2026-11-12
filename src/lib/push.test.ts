import { describe, expect, it } from 'vitest'
import { VAPID_PUBLIC_KEY, base64UrlToBytes, pickPushSupport } from './push'

describe('pickPushSupport', () => {
  it('asks iPhone / iPad users in Safari to install first', () => {
    expect(pickPushSupport({ hasPush: false, ios: true, standalone: false })).toBe('needs-install')
    expect(pickPushSupport({ hasPush: true, ios: true, standalone: false })).toBe('needs-install')
  })

  it('works in the installed iPhone app', () => {
    expect(pickPushSupport({ hasPush: true, ios: true, standalone: true })).toBe('ready')
  })

  it('an old iPhone (no push even when installed) is unsupported', () => {
    expect(pickPushSupport({ hasPush: false, ios: true, standalone: true })).toBe('unsupported')
  })

  it('other browsers: depends only on push support', () => {
    expect(pickPushSupport({ hasPush: true, ios: false, standalone: false })).toBe('ready')
    expect(pickPushSupport({ hasPush: false, ios: false, standalone: false })).toBe('unsupported')
  })
})

describe('base64UrlToBytes', () => {
  it('reads base64url (with - and _, no padding)', () => {
    // "+/8=" in normal base64 is the bytes FB FF; base64url writes it "-_8"
    expect([...base64UrlToBytes('-_8')]).toEqual([0xfb, 0xff])
    expect([...base64UrlToBytes('AQID')]).toEqual([1, 2, 3])
  })

  it('the app key is a valid public key (65 bytes, starting with 4)', () => {
    const bytes = base64UrlToBytes(VAPID_PUBLIC_KEY)
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(4)
  })
})
