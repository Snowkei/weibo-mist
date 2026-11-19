/**
 * Service worker: three jobs, no state.
 *
 *   1. route the toolbar icon and the global command into the content script
 *   2. keep the icon quiet (no badge noise, no popup)
 *   3. survive extension reloads without throwing
 */

const TOGGLE = { type: 'mist:toggle-palette' } as const

async function sendToActiveTab(message: unknown): Promise<boolean> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return false
    await chrome.tabs.sendMessage(tab.id, message)
    return true
  } catch {
    // No content script on this tab (chrome://, pdf viewer, or a stale inject).
    return false
  }
}

chrome.action.onClicked.addListener(() => {
  void sendToActiveTab(TOGGLE)
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-palette') void sendToActiveTab(TOGGLE)
})

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.info('[mist] installed — open weibo.com to meet the shell')
  }
  // Nothing to migrate yet; the settings schema normaliser owns upgrades.
})

chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, respond) => {
  if (message?.type === 'mist:ping') {
    respond({ ok: true, version: chrome.runtime.getManifest().version })
    return true
  }
  return false
})
