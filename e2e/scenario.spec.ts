import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test'
import { startStack, type Stack } from './stack'
import { choose, confirmDialog, fill, go, rowWith, shot, signIn } from './ui'

/**
 * One person's session against a real beenfard: sign in, adopt a simulated
 * UniFi device, build a network and a wifi network, and edit it while another
 * client (the API token "terraform") manages some of its fields.
 */
const MAC = 'de:ad:be:ef:00:01'
const LOCKED_MAC = 'de:ad:be:ef:00:09'
const FOREIGN_KEY = '00112233445566778899aabbccddeeff'
const SECRETS = ['first-radius-secret', 'rotated-radius-secret']

let stack: Stack
let context: BrowserContext
let page: Page

/** The JSON bodies of the update calls the browser makes, by RPC. */
const updates: { rpc: string; body: any }[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
/** Everything beenfar answered the browser, to check that no secret ever came back. */
const answers: string[] = []

function watch(p: Page) {
  p.on('request', (r: Request) => {
    const m = r.url().match(/\/(beenfar\.[^/]+\/Update[A-Za-z]+)$/)
    if (m && r.method() === 'POST') updates.push({ rpc: m[1]!, body: r.postDataJSON() })
  })
  p.on('response', async (r) => {
    if (r.url().includes('/beenfar.')) answers.push(await r.text().catch(() => ''))
  })
}

test.describe.serial('the UI against beenfard', () => {
  test.beforeAll(async ({ browser }) => {
    stack = await startStack()
    context = await browser.newContext()
    page = await context.newPage()
    watch(page)
  })

  test.afterAll(async () => {
    await context?.close()
    await stack?.stop()
  })

  test('signs in with a password', async () => {
    await page.goto(stack.url + '/')
    await expect(page.locator('[data-test=login]')).toBeVisible()
    await shot(page, '01-login')
    await signIn(page, stack.url, stack.adminUser, stack.adminPassword)
    await expect(page.locator('[data-test=current-user]')).toHaveText('admin')
    await expect(page.locator('[data-test=auth-method]')).toContainText('password')
    await expect(page).toHaveURL(/\/devices\/pending$/)
  })

  test('rejects a wrong password without signing in', async () => {
    const other = await context.browser()!.newContext()
    const p = await other.newPage()
    await signIn(p, stack.url, 'admin', 'not the password')
    await expect(p.locator('[data-test=login-error]')).toContainText(/invalid|incorrect|password/i)
    await expect(p.locator('[data-test=current-user]')).toHaveCount(0)
    await other.close()
  })

  test('adopts a simulated device that appears as pending', async () => {
    await expect(page.locator('[data-test=empty]')).toBeVisible()
    expect(stack.sim('ap1', MAC)).toMatchObject({ status: 404 }) // an unknown device is refused and noted
    await page.locator('[data-test=refresh]').click()
    await expect(rowWith(page, MAC)).toContainText('U7PG2')
    await shot(page, '02-pending-devices')

    await rowWith(page, MAC).locator('[data-test=adopt]').click()
    await confirmDialog(page, 'Adopt')
    await expect(rowWith(page, MAC)).toHaveCount(0)

    // The device now gets its new key, and then carries on with it.
    expect(stack.sim('ap1', MAC)).toMatchObject({ status: 200, type: 'setparam' })
    expect(stack.sim('ap1', MAC)).toMatchObject({ status: 200, type: 'noop', key: 'adopted' })

    await go(page, 'Devices')
    await expect(rowWith(page, MAC)).toContainText('Adopted')
    await shot(page, '03-devices')
  })

  test('creates a network', async () => {
    await go(page, 'Networks')
    await page.locator('[data-test=new]').click()
    await fill(page, 'f-name', 'iot')
    await page.locator('[data-test=f-vlan] input').fill('20')
    await fill(page, 'f-subnet', '10.0.20.1/24')
    await page.locator('[data-test=f-dhcp]').click()
    await fill(page, 'f-dhcp-start', '10.0.20.100')
    await fill(page, 'f-dhcp-stop', '10.0.20.200')
    await shot(page, '04-network-new')
    await page.locator('[data-test=save]').click()
    await expect(rowWith(page, 'iot')).toContainText('10.0.20.1/24')
    await shot(page, '05-networks')
  })

  test('creates a wifi network', async () => {
    await go(page, 'Wifi networks')
    await page.locator('[data-test=new]').click()
    await fill(page, 'f-ssid', 'home')
    await fill(page, 'f-key', 'correct-horse-battery')
    await choose(page, 'f-network', 'iot')
    await page.locator('[data-test=save]').click()
    await expect(rowWith(page, 'home')).toContainText('iot')
    await shot(page, '06-wifi-networks')
  })

  let wifiId = ''

  test('editing one field leaves the fields another client manages alone', async () => {
    const list = await stack.api('beenfar.config.v1.WifiNetworkService/ListWifiNetworks')
    wifiId = list.wifiNetworks[0].id

    // Terraform (the API token) manages the access point groups.
    await stack.api('beenfar.config.v1.WifiNetworkService/UpdateWifiNetwork', {
      wifiNetwork: { id: wifiId, apGroups: ['attic', 'garage'] },
      updateMask: 'apGroups',
    })

    // The person hides the network in the UI.
    await page.locator('[data-test=refresh]').click()
    await expect(rowWith(page, 'home')).toContainText('attic, garage')
    updates.length = 0
    await rowWith(page, 'home').locator('[data-test=edit]').click()
    await expect(page.locator('[data-test=writer-ap_groups]')).toContainText('last set by API token terraform')
    await page.locator('[data-test=f-hidden]').click()
    await shot(page, '07-wifi-edit')
    await page.locator('[data-test=save]').click()
    await expect(rowWith(page, 'home')).toContainText('hidden')

    // The request named only the field that was changed, and carried no AP groups.
    expect(updates).toHaveLength(1)
    expect(updates[0]!.body.updateMask).toBe('hidden')
    expect(updates[0]!.body.wifiNetwork).not.toHaveProperty('apGroups')
    expect(updates[0]!.body.wifiNetwork).not.toHaveProperty('ssid')
    expect(updates[0]!.body.wifiNetwork).not.toHaveProperty('securityKey')

    // And on the controller nothing else moved.
    const after = (await stack.api('beenfar.config.v1.WifiNetworkService/GetWifiNetwork', { id: wifiId })).wifiNetwork
    expect(after).toMatchObject({ ssid: 'home', hidden: true, securityKey: 'correct-horse-battery', apGroups: ['attic', 'garage'] })
    const writers = Object.fromEntries(after.fieldWriters.map((w: any) => [w.field, `${w.kind}:${w.writer}`])) // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(writers.ap_groups).toBe('FIELD_WRITER_KIND_API_TOKEN:terraform')
    expect(writers.hidden).toBe('FIELD_WRITER_KIND_USER:admin')
  })

  test('a change made elsewhere while editing is shown, not overwritten', async () => {
    await page.locator('[data-test=refresh]').click()
    await rowWith(page, 'home').locator('[data-test=edit]').click()
    await expect(page.locator('[data-test=editor]')).toBeVisible()

    // Meanwhile Terraform adds an access point group.
    await stack.api('beenfar.config.v1.WifiNetworkService/UpdateWifiNetwork', {
      wifiNetwork: { id: wifiId, apGroups: ['attic', 'garage', 'porch'] },
      updateMask: 'apGroups',
    })

    updates.length = 0
    await page.locator('[data-test=f-hidden]').click() // un-hide
    await page.locator('[data-test=save]').click()
    const notice = page.locator('[data-test=conflict]')
    await expect(notice).toContainText('Access point groups')
    await expect(notice).toContainText('attic, garage, porch')
    await shot(page, '08-wifi-conflict')
    expect(updates).toHaveLength(1) // refused once, and not retried by itself

    await page.locator('[data-test=keep-mine]').click()
    await page.locator('[data-test=save]').click()
    await expect(page.locator('[data-test=editor]')).toHaveCount(0)
    expect(updates).toHaveLength(2)
    expect(updates[1]!.body.updateMask).toBe('hidden')

    const after = (await stack.api('beenfar.config.v1.WifiNetworkService/GetWifiNetwork', { id: wifiId })).wifiNetwork
    expect(after.hidden ?? false).toBe(false)
    expect(after.apGroups).toEqual(['attic', 'garage', 'porch']) // Terraform's change survived
  })

  test('creates a RADIUS server and rotates its secret', async () => {
    await go(page, 'RADIUS servers')
    await page.locator('[data-test=new]').click()
    await fill(page, 'f-name', 'office')
    await fill(page, 'f-address', '10.0.0.5')
    await fill(page, 'f-secret', SECRETS[0]!)
    await page.locator('[data-test=save]').click()
    await expect(rowWith(page, 'office')).toContainText('version 1')

    await rowWith(page, 'office').locator('[data-test=rotate]').click()
    await expect(page.locator('[data-test=f-secret] input')).toHaveValue('') // never pre-filled
    await fill(page, 'f-secret', SECRETS[1]!)
    await shot(page, '10-radius-rotate')
    updates.length = 0
    await page.locator('[data-test=save]').click()
    await expect(rowWith(page, 'office')).toContainText('version 2')
    expect(updates[0]!.body.updateMask).toBe('sharedSecret')
    await shot(page, '09-radius-servers')

    const server = (await stack.api('beenfar.config.v1.RadiusServerService/ListRadiusServers')).radiusServers[0]
    expect(server.sharedSecret ?? '').toBe('')
    expect(Number(server.sharedSecretVersion)).toBe(2)
    // Nothing beenfar sent the browser, at any point, contained either secret.
    for (const secret of SECRETS) expect(answers.join('\n')).not.toContain(secret)
  })

  test('stores port settings for the adopted device, and says they are not applied', async () => {
    await go(page, 'Switch ports')
    await expect(page.locator('[data-test=not-applied]')).toContainText('does not send them to devices')
    await page.locator('[data-test=new]').click()
    await page.locator('[data-test=f-index] input').fill('2')
    await page.locator('[data-test=f-index] input').press('Tab')
    await fill(page, 'f-name', 'uplink')
    await page.locator('[data-test=save]').click()
    await expect(rowWith(page, 'uplink')).toContainText('2')
    await shot(page, '11-switch-ports')
    const ports = (await stack.api('beenfar.config.v1.SwitchPortService/ListSwitchPorts', {})).switchPorts
    expect(ports).toHaveLength(1)
    expect(ports[0]).toMatchObject({ name: 'uplink', portIndex: 2 })
  })

  test('shows a locked device and a reset device, and takes over the locked one', async () => {
    // A device another controller manages: no key opens it.
    expect(stack.sim('foreign', LOCKED_MAC, ['-key', FOREIGN_KEY])).toMatchObject({ status: 404 })
    // The adopted device is factory reset: it comes back on the default key.
    await new Promise((r) => setTimeout(r, 1500))
    expect(stack.sim('ap1', MAC, ['-reset'])).toMatchObject({ status: 404 })

    await go(page, 'Pending devices')
    await expect(rowWith(page, LOCKED_MAC).locator('[data-test=locked]')).toBeVisible()
    await expect(rowWith(page, LOCKED_MAC).locator('[data-test=adopt]')).toBeDisabled()
    await expect(rowWith(page, MAC).locator('[data-test=awaiting]')).toBeVisible()
    await shot(page, '12-pending-locked-and-reset')

    // An admin stores the foreign key; the device then shows its real model and is no longer locked.
    await go(page, 'Adapters')
    await expect(page.locator('[data-test=health]').first()).toHaveText('healthy')
    await shot(page, '13-adapters')
    await page.locator('[data-test=keys] textarea').fill(JSON.stringify([{ mac: LOCKED_MAC, authkey: FOREIGN_KEY, gcm: false }]))
    await page.locator('[data-test=import-keys]').click()
    await expect(page.locator('[data-test=keys] textarea')).toHaveValue('')
    expect(stack.sim('foreign', LOCKED_MAC, ['-key', FOREIGN_KEY])).toMatchObject({ status: 404 })

    await go(page, 'Pending devices')
    await expect(rowWith(page, LOCKED_MAC).locator('[data-test=locked]')).toHaveCount(0)
    await expect(rowWith(page, LOCKED_MAC)).toContainText('U7PG2')

    // The reset device is adopted again, and gets a new key.
    await rowWith(page, MAC).locator('[data-test=adopt]').click()
    await confirmDialog(page, 'Adopt')
    // It stays listed, as "re-adopting", until it runs on its new key.
    await expect(rowWith(page, MAC).locator('[data-test=in-progress]')).toBeVisible()
    await expect(rowWith(page, MAC).locator('[data-test=adopt]')).toBeDisabled()
    expect(stack.sim('ap1', MAC)).toMatchObject({ status: 200, type: 'setparam' })
    expect(stack.sim('ap1', MAC)).toMatchObject({ status: 200, type: 'noop', key: 'adopted' })
    await page.locator('[data-test=refresh]').click()
    await expect(rowWith(page, MAC)).toHaveCount(0)
  })

  test('creates an API token whose secret is shown once', async () => {
    await go(page, 'API tokens')
    await page.locator('[data-test=new]').click()
    await fill(page, 't-name', 'e2e-token')
    await page.locator('[data-test=create]').click()
    const secret = await page.locator('[data-test=secret] input').inputValue()
    expect(secret).toMatch(/^bf_/)
    await shot(page, '14-api-token-secret')
    await page.locator('[data-test=done]').click()
    await expect(page.locator('[data-test=secret-dialog]')).toHaveCount(0)
    expect(await page.content()).not.toContain(secret)
    await expect(rowWith(page, 'e2e-token')).toBeVisible()
    await shot(page, '15-api-tokens')

    // It works as a bearer token, and the list never shows it again.
    await stack.api('beenfar.config.v1.NetworkService/ListNetworks', {}, { token: secret })
    const listed = await stack.api('beenfar.admin.v1.ApiTokenService/ListApiTokens')
    expect(JSON.stringify(listed)).not.toContain(secret)
  })

  test('manages users, and a non-admin sees only what they may', async () => {
    await go(page, 'Users')
    await page.locator('[data-test=new]').click()
    await fill(page, 'u-name', 'operator')
    await fill(page, 'u-password', 'operator password')
    await fill(page, 'u-again', 'operator password')
    await page.locator('[data-test=create]').click()
    await expect(rowWith(page, 'operator')).toContainText('local')
    await shot(page, '16-users')

    await page.locator('[data-test=logout]').click()
    await expect(page.locator('[data-test=login]')).toBeVisible()

    await signIn(page, stack.url, 'operator', 'operator password')
    await expect(page.locator('[data-test=current-user]')).toHaveText('operator')
    const menu = page.locator('.n-menu')
    await expect(menu.getByRole('link', { name: 'Networks', exact: true })).toBeVisible()
    await expect(menu.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0)
    await expect(menu.getByRole('link', { name: 'Adapters', exact: true })).toHaveCount(0)
    await page.goto(stack.url + '/users')
    await expect(page.locator('[data-test=forbidden]')).toBeVisible()
    await expect(page.locator('[data-test=my-password]')).toBeVisible()
  })

  test('signs out, and the session is gone', async () => {
    await page.locator('[data-test=logout]').click()
    await expect(page.locator('[data-test=login]')).toBeVisible()
    const cookies = await context.cookies()
    expect(cookies.filter((c) => c.name.toLowerCase().includes('session'))).toEqual([])
    const me = await page.request.post(stack.url + '/beenfar.admin.v1.AuthService/GetCurrentUser', { data: {} })
    expect(me.status()).toBe(401)
  })
})

test.describe('the UI with the API under a path prefix', () => {
  test('signs in and edits through the prefix', async ({ browser }) => {
    const prefixed = await startStack({ prefix: '/beenfar-api' })
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    try {
      await signIn(p, prefixed.url, prefixed.adminUser, prefixed.adminPassword)
      await expect(p.locator('[data-test=current-user]')).toHaveText('admin')
      expect(await p.evaluate(() => (window as any).__LML_CONFIG__.apiBase)).toBe('/beenfar-api') // eslint-disable-line @typescript-eslint/no-explicit-any

      await go(p, 'Networks')
      await p.locator('[data-test=new]').click()
      await fill(p, 'f-name', 'guests')
      await p.locator('[data-test=save]').click()
      await expect(rowWith(p, 'guests')).toBeVisible()
      const nets = await prefixed.api('beenfar.config.v1.NetworkService/ListNetworks')
      expect(nets.networks.map((n: { name: string }) => n.name)).toEqual(['guests'])
    } finally {
      await ctx.close()
      await prefixed.stop()
    }
  })
})
