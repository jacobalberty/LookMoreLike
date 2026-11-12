import { create, type MessageInitShape } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { UserSchema, UserSource, type User } from '@jacobalberty/beenfar-api/beenfar/admin/v1/user_pb'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { NSwitch } from 'naive-ui'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountView } from '@/test-utils'
import UsersView from './UsersView.vue'

const confirm = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirm }))
beforeEach(() => confirm.mockReset().mockResolvedValue(true))

const user = (over: MessageInitShape<typeof UserSchema> = {}) =>
  create(UserSchema, { id: 'u1', etag: '2', username: 'alice', admin: false, source: UserSource.LOCAL, ...over })
const me = create(UserSchema, { id: 'root', username: 'root', admin: true, source: UserSource.LOCAL })

function fake(list: User[] = [user(), user({ id: 'u2', username: 'bob', source: UserSource.OIDC })]) {
  return {
    users: {
      listUsers: vi.fn().mockResolvedValue({ users: list }),
      getUser: vi.fn().mockResolvedValue({ user: list[0] }),
      createUser: vi.fn().mockResolvedValue({}),
      updateUser: vi.fn().mockImplementation(({ user }) => Promise.resolve({ user })),
      deleteUser: vi.fn().mockResolvedValue({}),
      setUserPassword: vi.fn().mockResolvedValue({}),
    },
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
const toggle = async (w: VueWrapper, test: string, v: boolean) => {
  w.findAllComponents(NSwitch).find((x) => x.attributes('data-test') === test)!.vm.$emit('update:value', v)
  await flushPromises()
}
const mount = (c: ReturnType<typeof fake>) => mountView(UsersView, c, { user: me })

describe('users', () => {
  it('lists users with their role and where the account comes from', async () => {
    const { w } = await mount(fake())
    expect(w.text()).toContain('alice')
    expect(w.text()).toContain('local')
    expect(w.text()).toContain('single sign-on')
  })

  it('offers a password change for local users only', async () => {
    const { w } = await mount(fake())
    expect(w.findAll('[data-test=password]')).toHaveLength(1) // alice, not bob (OIDC)
  })

  it('makes someone an admin, sending the rest of the user as it was', async () => {
    const c = fake()
    const { w } = await mount(c)
    await w.get('[data-test=edit]').trigger('click')
    await flushPromises()
    await toggle(w, 'f-admin', true)
    await click('[data-test=save]')
    const sent = c.users.updateUser.mock.calls[0]![0].user
    expect(sent.id).toBe('u1')
    expect(sent.etag).toBe('2')
    expect(sent.admin).toBe(true)
    expect(sent.username).toBe('alice') // UpdateUser has no mask, so what did not change is sent unchanged
  })

  it('does not call the controller when nothing changed', async () => {
    const c = fake()
    const { w } = await mount(c)
    await w.get('[data-test=edit]').trigger('click')
    await flushPromises()
    await click('[data-test=save]')
    expect(c.users.updateUser).not.toHaveBeenCalled()
  })

  it('creates a user with a checked password', async () => {
    const c = fake()
    const { w } = await mount(c)
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    await type('[data-test=u-name] input', 'carol')
    await type('[data-test=u-password] input', 'short')
    await type('[data-test=u-again] input', 'short')
    await click('[data-test=create]')
    expect(q('[data-test=create-error]')?.textContent).toContain('at least 8')
    await type('[data-test=u-password] input', 'long enough pw')
    await type('[data-test=u-again] input', 'something else')
    await click('[data-test=create]')
    expect(q('[data-test=create-error]')?.textContent).toContain('do not match')
    expect(c.users.createUser).not.toHaveBeenCalled()
    await type('[data-test=u-again] input', 'long enough pw')
    await click('[data-test=create]')
    const req = c.users.createUser.mock.calls[0]![0]
    expect(req.user.username).toBe('carol')
    expect(req.password).toBe('long enough pw')
    expect(c.users.listUsers).toHaveBeenCalledTimes(2)
  })

  it("shows the controller's reason when creating fails", async () => {
    const c = fake()
    c.users.createUser.mockRejectedValue(new ConnectError('username already in use', Code.AlreadyExists))
    const { w } = await mount(c)
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    await type('[data-test=u-name] input', 'alice')
    await type('[data-test=u-password] input', 'long enough pw')
    await type('[data-test=u-again] input', 'long enough pw')
    await click('[data-test=create]')
    expect(q('[data-test=create-error]')?.textContent).toContain('already in use')
  })

  it("sets another user's password without asking for theirs", async () => {
    const c = fake()
    const { w } = await mount(c)
    await w.get('[data-test=password]').trigger('click')
    await flushPromises()
    expect(q('[data-test=p-current]')).toBeNull()
    await type('[data-test=p-new] input', 'a new password')
    await type('[data-test=p-again] input', 'a new password')
    await click('[data-test=password-save]')
    expect(c.users.setUserPassword).toHaveBeenCalledWith({ id: 'u1', password: 'a new password', currentPassword: '' })
    expect(document.body.innerHTML).not.toContain('a new password')
  })

  it('asks for the current password when changing your own', async () => {
    const c = fake([user({ id: 'root', username: 'root', admin: true })])
    const { w } = await mount(c)
    await w.get('[data-test=password]').trigger('click')
    await flushPromises()
    expect(q('[data-test=p-current]')).not.toBeNull()
    await type('[data-test=p-new] input', 'a new password')
    await type('[data-test=p-again] input', 'a new password')
    await click('[data-test=password-save]')
    expect(q('[data-test=password-error]')?.textContent).toContain('current password')
    expect(c.users.setUserPassword).not.toHaveBeenCalled()
  })

  it('shows why a user cannot be deleted', async () => {
    const c = fake()
    c.users.deleteUser.mockRejectedValue(new ConnectError('cannot delete the last admin', Code.FailedPrecondition))
    const { w } = await mount(c)
    await w.get('[data-test=delete]').trigger('click')
    await flushPromises()
    expect(c.users.deleteUser).toHaveBeenCalledWith({ id: 'u1', etag: '2' })
    expect(w.get('[data-test=delete-error]').text()).toContain('last admin')
  })
})
