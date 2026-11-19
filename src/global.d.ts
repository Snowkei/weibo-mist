declare const __MIST_VERSION__: string

interface Window {
  __MIST__?: { version: string; host: string }
}
