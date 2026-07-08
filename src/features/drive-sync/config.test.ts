import { beforeEach, describe, expect, it } from 'vitest'
import {
  PLACEHOLDER_CLIENT_ID,
  clearStoredClientId,
  getStoredClientId,
  isClientIdConfigured,
  isPlaceholderClientId,
  setStoredClientId,
} from './config'

describe('config', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // Regression test: getStoredClientId() used to fall back to
  // PLACEHOLDER_CLIENT_ID (a real, non-empty string) when nothing was
  // stored, which then flowed straight into the Client ID <input>'s
  // value — pre-filling it with text that looked like a real, already-
  // entered Client ID. Clicking "Salvar" without editing anything saved
  // that placeholder string as a real Client ID, because the save
  // handler's empty-check saw a non-empty (placeholder) string, not "".
  it('getStoredClientId returns an empty string, never the placeholder, when nothing is stored', () => {
    expect(getStoredClientId()).toBe('')
    expect(getStoredClientId()).not.toBe(PLACEHOLDER_CLIENT_ID)
  })

  it('getStoredClientId returns the real stored value once one is saved', () => {
    setStoredClientId('123.apps.googleusercontent.com')
    expect(getStoredClientId()).toBe('123.apps.googleusercontent.com')
  })

  it('getStoredClientId returns an empty string again after clearing', () => {
    setStoredClientId('123.apps.googleusercontent.com')
    clearStoredClientId()
    expect(getStoredClientId()).toBe('')
  })

  it('setStoredClientId refuses to persist the literal placeholder string', () => {
    setStoredClientId(PLACEHOLDER_CLIENT_ID)
    expect(getStoredClientId()).toBe('')
  })

  it('isClientIdConfigured is false for an empty string', () => {
    expect(isClientIdConfigured('')).toBe(false)
  })

  it('isClientIdConfigured is false for the placeholder', () => {
    expect(isClientIdConfigured(PLACEHOLDER_CLIENT_ID)).toBe(false)
  })

  it('isClientIdConfigured is true for a real-looking value', () => {
    expect(isClientIdConfigured('123.apps.googleusercontent.com')).toBe(true)
  })

  it('isPlaceholderClientId detects the placeholder prefix', () => {
    expect(isPlaceholderClientId(PLACEHOLDER_CLIENT_ID)).toBe(true)
    expect(isPlaceholderClientId('123.apps.googleusercontent.com')).toBe(false)
  })
})
