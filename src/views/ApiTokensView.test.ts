import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { Code, ConnectError } from '@connectrpc/connect'
import { ApiTokenSchema, type ApiToken } from '@jacobalberty/beenfar-api/beenfar/admin/v1/api_token_pb'
import { UserSchema } from '@jacobalberty/beenfar-api/beenfar/admin/v1/user_pb'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountView } from '@/test-utils'
import ApiTokensView from './ApiTokensView.vue'

const confirm = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirm }))
beforeEach(() => confirm.mockReset().mockResolvedValue(true))

const SECRET = 'bf_abcdefghijkl_0123456789secret0123456789'
const token = (over: Partial<ApiToken> = {}) => create(ApiTokenSchema, { id: 't1', name: 'terraform-ci', prefix: 'bf_abcdefghijkl', userId: 'u1', ...over })

function fake(list: ApiToken[] = [token()]) {
  return {
    tokens: {
      listApiTokens: vi.fn().mockResolvedValue({ apiTokens: list }),
      createApiToken: vi.fn().mockImplementation(({ apiToken }) => Promise.resolve({ apiToken: { ...apiToken, id: 't2', prefix: 'bf_abcdefghijkl' }, secret: SECRET })),
      deleteApiToken: vi.fn().mockResolvedValue({}),
    },
    users: { listUsers: vi.fn().mockResolvedValue({ users: [create(UserSchema, { id: 'u1', username: 'alice' }), create(UserSchema, { id: 'u2', username: 'bob' })] }) },
  }
}
const q = (sel: string) => document.body.querySelector(sel)
const click = async (sel: string) => {
  ;(q(sel) as HTMLElement).click()
  await flushPromises()
}
const type = async (sel: string, value: string) => {
  const el = q(sel) as HTMLInputElement
  el.value = value
  el.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('API tokens', () => {
  it('lists tokens by name and prefix, never a secret', async () => {
    const { w } = await mountView(ApiTokensView, fake())
    expect(w.text()).toContain('terraform-ci')
    expect(w.text()).toContain('bf_abcdefghijkl…')
    expect(w.text()).toContain('never') // expiry
  })

  it('names owners to admins, and only for admins', async () => {
    const c = fake([token({ userId: 'u2' })])
    const admin = create(UserSchema, { id: 'u1', username: 'alice', admin: true })
    const { w } = await mountView(ApiTokensView, c, { user: admin })
    expect(c.users.listUsers).toHaveBeenCalled()
    expect(w.text()).toContain('Owner')
    expect(w.text()).toContain('bob')

    const c2 = fake()
    const { w: w2 } = await mountView(ApiTokensView, c2, { user: create(UserSchema, { id: 'u1', username: 'alice' }) })
    expect(c2.users.listUsers).not.toHaveBeenCalled()
    expect(w2.text()).not.toContain('Owner')
  })

  it('creates a token and shows its secret once', async () => {
    const c = fake()
    const { w } = await mountView(ApiTokensView, c)
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    await type('[data-test=t-name] input', 'ci-job')
    await click('[data-test=create]')
    expect(c.tokens.createApiToken.mock.calls[0]![0].apiToken.name).toBe('ci-job')
    expect(c.tokens.createApiToken.mock.calls[0]![0].apiToken.expireTime).toBeUndefined()
    const box = q('[data-test=secret] input') as HTMLInputElement
    expect(box.value).toBe(SECRET)
    expect(q('[data-test=secret-dialog]')?.textContent).toContain('only time it is shown')
    expect(c.tokens.listApiTokens).toHaveBeenCalledTimes(2) // the list refreshed
  })

  it('forgets the secret when the dialog is dismissed', async () => {
    const c = fake()
    const { w } = await mountView(ApiTokensView, c)
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    await type('[data-test=t-name] input', 'ci-job')
    await click('[data-test=create]')
    await click('[data-test=done]')
    expect(document.body.innerHTML).not.toContain(SECRET)
    expect(w.html()).not.toContain(SECRET)
    // The list (which is all the API offers afterwards) has no secret.
    expect(JSON.stringify(c.tokens.listApiTokens.mock.results)).not.toContain(SECRET)
  })

  it('requires a name', async () => {
    const c = fake()
    const { w } = await mountView(ApiTokensView, c)
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    await click('[data-test=create]')
    expect(c.tokens.createApiToken).not.toHaveBeenCalled()
    expect(q('[data-test=create-error]')?.textContent).toContain('name')
  })

  it('sends an expiry when one is chosen', async () => {
    const c = fake()
    const { w } = await mountView(ApiTokensView, c)
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    await type('[data-test=t-name] input', 'short-lived')
    const { NSelect } = await import('naive-ui')
    w.findAllComponents(NSelect).find((x) => x.attributes('data-test') === 't-expiry')!.vm.$emit('update:value', 30)
    await flushPromises()
    const before = Date.now()
    await click('[data-test=create]')
    const at = c.tokens.createApiToken.mock.calls[0]![0].apiToken.expireTime
    const ms = Number(at.seconds) * 1000
    expect(ms - before).toBeGreaterThan(29 * 86400_000)
    expect(ms - before).toBeLessThan(31 * 86400_000)
    expect(timestampFromDate(new Date(ms)).seconds).toBe(at.seconds)
  })

  it("shows the controller's reason when creating fails", async () => {
    const c = fake()
    c.tokens.createApiToken.mockRejectedValue(new ConnectError('name must be 1-64 bytes', Code.InvalidArgument))
    const { w } = await mountView(ApiTokensView, c)
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    await type('[data-test=t-name] input', 'x')
    await click('[data-test=create]')
    expect(q('[data-test=create-error]')?.textContent).toContain('1-64 bytes')
    expect(q('[data-test=secret]')).toBeNull()
  })

  it('revokes after confirmation', async () => {
    const c = fake()
    const { w } = await mountView(ApiTokensView, c)
    await w.get('[data-test=revoke]').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0]![0].content).toContain('stops working immediately')
    expect(c.tokens.deleteApiToken).toHaveBeenCalledWith({ id: 't1' })
  })
})
