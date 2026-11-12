import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { extname, join, normalize, resolve } from 'node:path'

/**
 * A real beenfard on a temporary SQLite database, behind a small reverse
 * proxy that does what the Traefik rules in examples/ do: beenfar's paths go
 * to beenfard, everything else is the UI from dist/, and the Host header is
 * kept (beenfar compares it with Origin). Devices talk to beenfard directly.
 */
export interface Stack {
  /** What the browser opens: the proxy. */
  url: string
  /** beenfard itself, where devices send their informs. */
  beenfardUrl: string
  apiBase: string
  adminUser: string
  adminPassword: string
  /** An API token of the admin, named "terraform": the other client in the scenarios. */
  token: string
  /** Calls an RPC as the API token (or another), returning the JSON response. */
  api: (rpc: string, body?: unknown, opts?: { token?: string; expect?: number }) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Plays a UniFi device for one inform; returns what the controller answered. */
  sim: (name: string, mac: string, args?: string[]) => { status: number; type?: string; key: string }
  stop: () => Promise<void>
}

const root = resolve(import.meta.dirname, '..')
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

async function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createNetServer()
    s.once('error', fail)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number }
      s.close(() => ok(port))
    })
  })
}

function required(name: string, hint: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set: ${hint}`)
  return v
}

let simdevice: string | undefined
function simdeviceBinary(): string {
  if (simdevice) return simdevice
  const dir = join(root, 'e2e', '.tmp')
  mkdirSync(dir, { recursive: true })
  const out = join(dir, 'simdevice')
  execFileSync('go', ['build', '-o', out, '.'], { cwd: join(root, 'e2e', 'simdevice'), stdio: 'inherit' })
  return (simdevice = out)
}

/** beenfar's own paths, as the reverse proxy routes them. */
const isApiPath = (p: string) =>
  p.startsWith('/beenfar.') || p.startsWith('/api/') || p.startsWith('/auth/') || p === '/openapi.json' || p === '/healthz'

export async function startStack(opts: { prefix?: string } = {}): Promise<Stack> {
  const prefix = opts.prefix ?? ''
  const beenfard = required('BEENFARD_BIN', 'build one: go build -o /tmp/beenfard github.com/jacobalberty/beenfar/cmd/beenfard')
  const dist = join(root, 'dist')
  if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/ is missing: run npm run build first')
  const sim = simdeviceBinary()

  mkdirSync(join(root, 'e2e', '.tmp'), { recursive: true })
  const dir = mkdtempSync(join(root, 'e2e', '.tmp', 'stack-'))
  const db = 'sqlite://' + join(dir, 'beenfar.db')
  const adminUser = 'admin'
  const adminPassword = 'e2e-admin-password'

  const run = (stdin: string, ...args: string[]) =>
    execFileSync(beenfard, args, { input: stdin, env: { ...process.env, BEENFAR_DB: db }, encoding: 'utf8' })
  run(adminPassword + '\n', 'admin', 'create', '-username', adminUser)
  const token = run('', 'admin', 'token', '-username', adminUser, '-name', 'terraform').trim().split('\n').pop()!

  const beenfardPort = await freePort()
  const beenfardUrl = `http://127.0.0.1:${beenfardPort}`
  const proc: ChildProcess = spawn(beenfard, [], {
    env: {
      ...process.env,
      BEENFAR_DB: db,
      BEENFAR_LISTEN: `127.0.0.1:${beenfardPort}`,
      BEENFAR_LOG_LEVEL: 'warn',
      // So a factory-reset device is noticed after a second, not two minutes.
      BEENFAR_UNIFI_READOPT_AFTER: '1s',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  const exited = new Promise<number | null>((ok) => proc.once('exit', ok))

  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${beenfardUrl}/healthz`)).ok) break
    } catch {
      /* not up yet */
    }
    if (i > 100) throw new Error('beenfard did not start')
    await new Promise((r) => setTimeout(r, 100))
  }

  const proxyPort = await freePort()
  const server: Server = createServer((req, res) => handle(req, res, { prefix, beenfardPort, dist }))
  await new Promise<void>((ok) => server.listen(proxyPort, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${proxyPort}`

  const api: Stack['api'] = async (rpc, body = {}, o = {}) => {
    const res = await fetch(`${url}${prefix}/${rpc}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.token ?? token}` },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    if (res.status !== (o.expect ?? 200)) throw new Error(`${rpc}: ${res.status} ${text}`)
    return text ? JSON.parse(text) : {}
  }

  return {
    url,
    beenfardUrl,
    apiBase: prefix || '/',
    adminUser,
    adminPassword,
    token,
    api,
    sim: (name, mac, args = []) => {
      const out = execFileSync(sim, ['-url', beenfardUrl, '-mac', mac, '-state', join(dir, `${name}.json`), ...args], { encoding: 'utf8' })
      return JSON.parse(out.trim())
    },
    stop: async () => {
      await new Promise<void>((ok) => server.close(() => ok()))
      server.closeAllConnections()
      proc.kill('SIGTERM')
      await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))])
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

function handle(req: IncomingMessage, res: ServerResponse, o: { prefix: string; beenfardPort: number; dist: string }) {
  const url = new URL(req.url ?? '/', 'http://x')
  let path = url.pathname

  // The API under a prefix: strip it, as Traefik's stripprefix does.
  if (o.prefix && (path === o.prefix || path.startsWith(o.prefix + '/'))) {
    return proxy(req, res, o.beenfardPort, path.slice(o.prefix.length) + url.search)
  }
  // OIDC's callback is built without the prefix, so /auth/ is routed either way.
  if (path.startsWith('/auth/')) return proxy(req, res, o.beenfardPort, path + url.search)
  if (!o.prefix && isApiPath(path)) return proxy(req, res, o.beenfardPort, path + url.search)

  if (path === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' })
    return void res.end(`window.__LML_CONFIG__ = { apiBase: '${o.prefix || '/'}' }\n`)
  }
  // The same rules as docker/nginx.conf: a path with an extension is a file
  // or a 404, anything else is a route of the app.
  if (extname(path)) {
    const file = normalize(join(o.dist, path))
    if (!file.startsWith(o.dist) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404)
      return void res.end('not found')
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' })
    return void res.end(readFileSync(file))
  }
  path = '/index.html'
  res.writeHead(200, { 'Content-Type': types['.html']!, 'Cache-Control': 'no-cache' })
  res.end(readFileSync(join(o.dist, path)))
}

/** Forwards to beenfard with the request's own Host header, as Traefik does. */
function proxy(req: IncomingMessage, res: ServerResponse, port: number, path: string) {
  const up = httpRequest({ host: '127.0.0.1', port, method: req.method, path, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers)
    r.pipe(res)
  })
  up.on('error', () => {
    res.writeHead(502)
    res.end('bad gateway')
  })
  req.pipe(up)
}
