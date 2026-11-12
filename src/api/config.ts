/**
 * Where beenfar's API is, relative to this page.
 *
 * The UI and the API must share one origin: beenfar refuses cookie-
 * authenticated requests whose Origin is not its own Host. So the setting is
 * a path prefix on this origin ("/" when beenfard is mounted at the root, or
 * e.g. "/beenfar-api" when a reverse proxy strips that prefix), never a
 * URL on another host.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/** Returns the prefix without a trailing slash: "" for the root. */
export function normalizeApiBase(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return ''
  if (typeof raw !== 'string') throw new ConfigError('apiBase must be a string')
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) {
    throw new ConfigError(
      `apiBase ${JSON.stringify(raw)} is on another origin. The API must be served from this origin ` +
        'through the reverse proxy (see the README); set apiBase to a path such as "/" or "/beenfar-api".',
    )
  }
  if (!raw.startsWith('/')) throw new ConfigError(`apiBase ${JSON.stringify(raw)} must start with "/"`)
  if (/[?#\s]/.test(raw)) throw new ConfigError(`apiBase ${JSON.stringify(raw)} must be a plain path`)
  return raw.replace(/\/+$/, '')
}

/** The configured API prefix, from the container's /config.js. */
export function apiBase(win: Pick<Window, '__LML_CONFIG__'> = window): string {
  return normalizeApiBase(win.__LML_CONFIG__?.apiBase)
}

/**
 * Prefixes a path the API hands out (such as an OIDC login_url, which is
 * relative to the API root) with the API prefix. Absolute URLs pass through.
 */
export function apiPath(path: string, base: string = apiBase()): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return path
  return base + (path.startsWith('/') ? path : '/' + path)
}
