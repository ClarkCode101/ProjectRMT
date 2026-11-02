// Reads the text out of an uploaded file, entirely in the browser (nothing is uploaded).
// The PDF and Word libraries are big, so each is downloaded only when a file of that type is picked.

export const ACCEPTED_FILES = '.pdf,.docx,.txt'

export class UnreadableFileError extends Error {}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.txt')) return file.text()
  if (name.endsWith('.docx')) return docxText(file)
  if (name.endsWith('.pdf')) return pdfText(file)
  throw new UnreadableFileError('Only PDF, Word (.docx) and text (.txt) files can be read. Old .doc files: open them in Word and save as .docx.')
}

async function docxText(file: File): Promise<string> {
  const { default: mammoth } = await import('mammoth/mammoth.browser.min.js')
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return result.value
  } catch {
    throw new UnreadableFileError('This Word file couldn’t be opened. Check that it is a .docx file and not password-protected.')
  }
}

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  let pdf
  try {
    pdf = await task.promise
  } catch {
    throw new UnreadableFileError('This PDF couldn’t be opened. It may be damaged or password-protected.')
  }

  const pages: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    let text = ''
    let lastY: number | null = null
    for (const item of content.items) {
      if (!('str' in item)) continue
      // A new line starts when the text moves down the page (PDFs don't always mark line ends).
      const y = item.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2 && !text.endsWith('\n')) text += '\n'
      text += item.str
      if (item.hasEOL) text += '\n'
      lastY = y
    }
    pages.push(text)
  }
  await task.destroy() // frees the PDF worker

  const all = pages.join('\n')
  if (all.replace(/\s/g, '').length === 0) {
    throw new UnreadableFileError(
      'No text was found in this PDF. It is probably a scanned picture of pages. Copy the text into the "Paste text" box instead, or use a PDF where you can select the words.',
    )
  }
  return all
}
