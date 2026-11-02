// mammoth ships no TypeScript types. We only use its ready-made browser build and one function.
declare module 'mammoth/mammoth.browser.min.js' {
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>
  }
  export default mammoth
}
