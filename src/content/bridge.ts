/**
 * Hot search and account, on top of the MAIN-world API bridge.
 *
 * These two were the only things the old bridge knew how to fetch; now they are
 * ordinary API calls like everything else, and a failure returns `null` instead
 * of a dead panel.
 */

import { wbGet } from './api'

export interface RawHot {
  word?: string
  note?: string
  num?: number
  label_name?: string
  word_scheme?: string
}

export interface RawProfile {
  screen_name?: string
  avatar_large?: string
  profile_url?: string
  idstr?: string
}

/** weibo moved this endpoint around twice; try in order. */
const HOT_ENDPOINTS = ['/ajax/side/hotSearch', '/ajax/statuses/hot_band', '/ajax/side/search/hot_band'] as const

export async function ask<T>(kind: 'hot' | 'profile'): Promise<T | null> {
  if (kind === 'profile') {
    return (await wbGet<T>('/ajax/profile/info')) ?? null
  }
  for (const path of HOT_ENDPOINTS) {
    const payload = await wbGet<T>(path)
    if (payload) return payload
  }
  return null
}
