/**
 * Browser automation worker — runs Playwright in a Worker thread.
 * Only works in Node.js context (Electron renderer with nodeIntegration).
 * This file is intentionally minimal; Playwright is lazy-required.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const self: any

let browser: any = null
let page: any = null

async function ensureBrowser() {
  if (browser) return
  // Playwright is available in the Electron process via node_modules
  const { chromium } = await import('playwright')
  browser = await chromium.launch({ headless: false })
  page = await browser.newPage()
}

self.onmessage = async (ev: MessageEvent) => {
  const { id, tool, args } = ev.data
  try {
    await ensureBrowser()
    let result: Record<string, unknown> = {}

    if (tool === 'browser_navigate') {
      await page.goto(args.url as string, { timeout: 30_000 })
      result = { url: page.url(), title: await page.title() }
    } else if (tool === 'browser_screenshot') {
      const buf = await page.screenshot({ type: 'png' })
      result = { base64: (buf as Buffer).toString('base64') }
    } else if (tool === 'browser_click') {
      await page.click(args.selector as string)
      result = { success: true }
    } else if (tool === 'browser_type') {
      await page.fill(args.selector as string, args.text as string)
      result = { success: true }
    } else {
      result = { error: `Unknown browser tool: ${tool}` }
    }

    self.postMessage({ id, result })
  } catch (err) {
    self.postMessage({ id, result: { error: String(err) } })
  }
}
