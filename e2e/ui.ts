import type { Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** Writes a screenshot of the current screen when SCREENSHOT_DIR is set. */
export async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SCREENSHOT_DIR
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  // Let toasts and transitions settle so the picture is the steady state.
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(dir, `${name}.png`) })
}

export async function signIn(page: Page, url: string, username: string, password: string): Promise<void> {
  await page.goto(url + '/')
  await page.locator('[data-test=password-form] input[type=text]').fill(username)
  await page.locator('[data-test=password-form] input[type=password]').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Opens a screen from the navigation, as a person would. */
export async function go(page: Page, title: string): Promise<void> {
  await page.locator('.n-menu').getByRole('link', { name: title, exact: true }).click()
}

/** Chooses an option of a Naive UI select; its dropdown is rendered elsewhere in the page. */
export async function choose(page: Page, field: string, option: string): Promise<void> {
  await page.locator(`[data-test=${field}]`).click()
  await page.locator('.n-base-select-option', { hasText: option }).first().click()
}

/** Fills a text input inside a data-test element. */
export async function fill(page: Page, field: string, value: string): Promise<void> {
  await page.locator(`[data-test=${field}] input`).fill(value)
}

/** Answers a confirmation dialog. */
export async function confirmDialog(page: Page, button: string): Promise<void> {
  await page.locator('.n-dialog').getByRole('button', { name: button, exact: true }).click()
}

/** The text of every row of the screen's table. */
export async function rows(page: Page): Promise<string[]> {
  return page.locator('.n-data-table-tbody .n-data-table-tr').allInnerTexts()
}

export function rowWith(page: Page, text: string) {
  return page.locator('.n-data-table-tbody .n-data-table-tr', { hasText: text })
}
