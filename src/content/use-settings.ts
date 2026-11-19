import { useEffect, useState } from 'preact/hooks'
import { getSettings, onSettingsChange } from '../shared/store'
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings'

/** Subscribe a component to the settings singleton. */
export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(getSettings())
  useEffect(() => onSettingsChange(setSettings), [])
  return settings ?? DEFAULT_SETTINGS
}
