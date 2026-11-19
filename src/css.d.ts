/**
 * esbuild's `text` loader hands .css/.svg files over as raw strings, which is
 * what lets the shadow root adopt the shell stylesheet without a second fetch.
 */
declare module '*.css' {
  const css: string
  export default css
}

declare module '*.svg' {
  const svg: string
  export default svg
}
