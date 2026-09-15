import type { Browser, Page } from "playwright";

/** Dispose request/response history after each URL, and recycle Chromium periodically. */
export class CrawlBrowser {
  private browser: Browser | null = null;
  private pages = 0;
  constructor(private launch: () => Promise<Browser>, private userAgent: string, private recycleAfter = 10) {}

  async inspect<T>(prepare: (page: Page) => Promise<void>, collect: (page: Page) => Promise<T>): Promise<T> {
    if (this.browser && this.pages >= this.recycleAfter) await this.close();
    this.browser ??= await this.launch();
    const context = await this.browser.newContext({ userAgent: this.userAgent, ignoreHTTPSErrors: false });
    this.pages++;
    try {
      const page = await context.newPage();
      await prepare(page);
      return await collect(page);
    } finally {
      await context.close();
    }
  }

  async close() {
    const browser = this.browser;
    this.browser = null;
    this.pages = 0;
    await browser?.close();
  }
}
