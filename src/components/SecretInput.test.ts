import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SecretInput from './SecretInput.vue'

describe('SecretInput', () => {
  const input = (w: ReturnType<typeof mount>) => w.get('input').element as HTMLInputElement

  it('starts empty and masked', () => {
    const w = mount(SecretInput, { props: { modelValue: '' } })
    expect(input(w).value).toBe('')
    expect(input(w).type).toBe('password')
  })

  it('tells password managers it is a new secret', () => {
    expect(input(mount(SecretInput)).autocomplete).toBe('new-password')
  })

  it('reports what is typed', async () => {
    const w = mount(SecretInput, { props: { modelValue: '', 'onUpdate:modelValue': (v: string) => w.setProps({ modelValue: v }) } })
    await w.get('input').setValue('s3cret')
    expect(w.props('modelValue')).toBe('s3cret')
  })
})
