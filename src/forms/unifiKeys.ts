/**
 * Parses the credentials of UniFi devices to take over, as extracted from the
 * controller that manages them: a JSON array of {mac, authkey, gcm}, the same
 * format `beenfard admin import-unifi` reads. The keys are secrets: they are
 * only ever sent to the controller, never shown again.
 */
export interface UnifiKeyInput {
  mac: string
  authkey: string
  gcm: boolean
}

export interface ParsedKeys {
  keys: UnifiKeyInput[]
  errors: string[]
}

const macDigits = /^[0-9a-f]{12}$/i
const authKey = /^[0-9a-f]{32}$/i

export function parseUnifiKeys(text: string): ParsedKeys {
  const trimmed = text.trim()
  if (!trimmed) return { keys: [], errors: ['Paste the keys as JSON.'] }
  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch {
    return { keys: [], errors: ['This is not valid JSON. Expected an array like [{"mac": "…", "authkey": "…", "gcm": true}].'] }
  }
  if (!Array.isArray(raw)) return { keys: [], errors: ['Expected a JSON array of devices.'] }
  if (raw.length === 0) return { keys: [], errors: ['The list is empty.'] }

  const keys: UnifiKeyInput[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  raw.forEach((item: unknown, i) => {
    const n = i + 1
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      errors.push(`Entry ${n} is not an object.`)
      return
    }
    const { mac, authkey, gcm } = item as Record<string, unknown>
    if (typeof mac !== 'string' || !macDigits.test(mac.replace(/[:.-]/g, ''))) {
      errors.push(`Entry ${n}: "mac" must be a MAC address.`)
      return
    }
    if (typeof authkey !== 'string' || !authKey.test(authkey)) {
      // Never echo the key itself back.
      errors.push(`Entry ${n} (${mac}): "authkey" must be 32 hex digits.`)
      return
    }
    if (gcm !== undefined && typeof gcm !== 'boolean') {
      errors.push(`Entry ${n} (${mac}): "gcm" must be true or false.`)
      return
    }
    const id = mac.replace(/[:.-]/g, '').toLowerCase()
    if (seen.has(id)) {
      errors.push(`Entry ${n}: ${mac} appears more than once.`)
      return
    }
    seen.add(id)
    keys.push({ mac, authkey, gcm: gcm === true })
  })
  return { keys: errors.length ? [] : keys, errors }
}
