import { Code, ConnectError } from '@connectrpc/connect'
import { describe, expect, it } from 'vitest'
import { createClients } from './clients'
import { apiPath, ConfigError, normalizeApiBase } from './config'
import { asConnectError, describeError, isConflict, isUnauthenticated } from './errors'
import { createTransport } from './transport'

describe('normalizeApiBase', () => {
  it('accepts the root and path prefixes', () => {
    expect(normalizeApiBase(undefined)).toBe('')
    expect(normalizeApiBase('')).toBe('')
    expect(normalizeApiBase('/')).toBe('')
    expect(normalizeApiBase('/beenfar-api')).toBe('/beenfar-api')
    expect(normalizeApiBase('/a/b///')).toBe('/a/b')
  })

  it.each(['https://beenfar.example.com', 'http://localhost:8080/', '//beenfar.example.com', 'api', '/a b', '/a?x=1', '/a#x'])(
    'rejects %j',
    (raw) => {
      expect(() => normalizeApiBase(raw)).toThrow(ConfigError)
    },
  )

  it('says why another origin does not work', () => {
    expect(() => normalizeApiBase('https://x.example')).toThrow(/another origin/)
  })

  it('rejects non-strings', () => {
    expect(() => normalizeApiBase(42)).toThrow(ConfigError)
  })
})

describe('apiPath', () => {
  it('puts API-relative paths under the prefix', () => {
    expect(apiPath('/auth/oidc/corp/login', '')).toBe('/auth/oidc/corp/login')
    expect(apiPath('/auth/oidc/corp/login', '/beenfar-api')).toBe('/beenfar-api/auth/oidc/corp/login')
    expect(apiPath('auth/x', '/p')).toBe('/p/auth/x')
  })

  it('leaves absolute URLs alone', () => {
    expect(apiPath('https://idp.example/logout', '/p')).toBe('https://idp.example/logout')
  })
})

/** A fetch that records the request and answers with an empty Connect response. */
function recordingFetch() {
  const seen: { url: string; method: string }[] = []
  const impl: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    seen.push({ url, method: init?.method ?? 'GET' })
    return Promise.resolve(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
  }
  return { seen, impl }
}

describe('transport', () => {
  it('calls the API at the root', async () => {
    const { seen, impl } = recordingFetch()
    await createClients(createTransport('', impl)).auth.getAuthConfig({})
    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe('/beenfar.admin.v1.AuthService/GetAuthConfig')
  })

  it('calls the API under a prefix', async () => {
    const { seen, impl } = recordingFetch()
    await createClients(createTransport('/beenfar-api', impl)).networks.listNetworks({})
    expect(seen[0]?.url).toBe('/beenfar-api/beenfar.config.v1.NetworkService/ListNetworks')
  })
})

describe('errors', () => {
  const err = (code: Code, msg = 'boom') => new ConnectError(msg, code)

  it('recognises conflicts and sign-out', () => {
    expect(isConflict(err(Code.Aborted))).toBe(true)
    expect(isConflict(err(Code.NotFound))).toBe(false)
    expect(isUnauthenticated(err(Code.Unauthenticated))).toBe(true)
  })

  it('keeps the messages meant for people', () => {
    expect(describeError(err(Code.InvalidArgument, 'ssid must be 1-32 bytes'))).toBe('ssid must be 1-32 bytes')
    expect(describeError(err(Code.AlreadyExists, 'ssid already in use'))).toBe('ssid already in use')
    expect(describeError(err(Code.FailedPrecondition, 'network is used by 2 wireless network(s)'))).toContain('used by')
  })

  it('does not leak internals', () => {
    expect(describeError(err(Code.Internal, 'sql: no rows at /srv/x.go:12'))).not.toContain('sql')
    expect(describeError(new TypeError('Failed to fetch'))).toBe('Something went wrong on the controller.')
  })

  it('wraps anything thrown', () => {
    expect(asConnectError('x')).toBeInstanceOf(ConnectError)
  })
})
