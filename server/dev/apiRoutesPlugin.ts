import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'

/**
 * Runs the `api/` serverless functions inside the Vite dev server.
 *
 * In production Vercel builds each file under `api/` into its own function. In
 * development `vercel dev --local` only delegates to the framework's dev
 * command unless the project is linked to a Vercel account, so `/api/*` is
 * served as raw module source and every backend call fails with a parse error
 * that looks like a backend outage. That is a confusing way to lose an
 * afternoon, and it requires a Vercel login to avoid.
 *
 * This maps the same file layout onto the dev server instead: `/api/quiz/start`
 * loads `api/quiz/start.ts` and calls its default export with request and
 * response objects shaped like the ones Vercel passes. No account needed, and
 * the handlers are the real ones rather than mocks.
 *
 * Dev only. It is never part of a production build, where Vercel does this.
 */

const API_PREFIX = '/api/'
const MAX_BODY_BYTES = 1024 * 1024

/**
 * Vite only exposes `VITE_`-prefixed variables, and only to the browser, so the
 * handlers would start with no `SUPABASE_URL` or `SUPABASE_SECRET_KEY` at all.
 *
 * Variables already present are never overwritten. That is what lets a caller
 * point the dev server somewhere safe — Playwright sets a dead local Supabase
 * for exactly this reason, so a test that forgets to mock a route fails to
 * connect instead of reaching a real database.
 */
function loadServerEnv(root: string, logger: ViteDevServer['config']['logger']): void {
  const envPath = join(root, '.env.local')

  if (!existsSync(envPath)) {
    logger.warn(
      '[api] no .env.local found — API routes will fail until it exists',
    )
    return
  }

  const preset = new Map(Object.entries(process.env))

  // `process.loadEnvFile` is newer than the installed @types/node, so it is
  // reached through a narrow cast rather than by widening the global types.
  const loadEnvFile = (process as NodeJS.Process & {
    loadEnvFile?: (path: string) => void
  }).loadEnvFile

  if (typeof loadEnvFile !== 'function') {
    logger.warn('[api] this Node version cannot read .env.local (needs 20.6+)')
    return
  }

  try {
    loadEnvFile(envPath)
  } catch (error) {
    logger.error(
      `[api] could not read .env.local: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return
  }

  // `loadEnvFile` overwrites, so anything the caller had already set is put
  // back afterwards.
  for (const [name, value] of preset) {
    if (value !== undefined) {
      process.env[name] = value
    }
  }
}

interface VercelLikeResponse {
  setHeader(name: string, value: string | string[]): void
  status(code: number): VercelLikeResponse
  json(body: unknown): void
}

function findHandlerFiles(root: string): Map<string, string> {
  const routes = new Map<string, string>()
  const apiRoot = join(root, 'api')

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry)

      if (statSync(path).isDirectory()) {
        // `__tests__` holds test files, not routes.
        if (entry !== '__tests__') {
          walk(path)
        }

        continue
      }

      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) {
        continue
      }

      const route = `/api/${relative(apiRoot, path).split(sep).join('/')}`.replace(
        /\.ts$/,
        '',
      )

      routes.set(route, path)
    }
  }

  walk(apiRoot)

  return routes
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length

    if (size > MAX_BODY_BYTES) {
      throw new Error('Request body too large')
    }

    chunks.push(buffer)
  }

  if (chunks.length === 0) {
    return undefined
  }

  const raw = Buffer.concat(chunks).toString('utf8')

  if (!raw.trim()) {
    return undefined
  }

  // Vercel parses a JSON body before the handler sees it. Anything that is not
  // JSON is handed through as text, which is what the handlers expect too.
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

function adaptResponse(res: ServerResponse): VercelLikeResponse {
  let statusCode = 200

  const adapter: VercelLikeResponse = {
    setHeader(name, value) {
      res.setHeader(name, value)
    },
    status(code) {
      statusCode = code
      return adapter
    },
    json(body) {
      res.statusCode = statusCode
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    },
  }

  return adapter
}

export function apiRoutesPlugin(): Plugin {
  return {
    name: 'signmaster-dev-api-routes',
    apply: 'serve',

    configureServer(server: ViteDevServer) {
      loadServerEnv(server.config.root, server.config.logger)

      const routes = findHandlerFiles(server.config.root)

      // Compiling a handler's module graph on first use costs hundreds of
      // milliseconds and lands on whichever request happens to be first, which
      // under a parallel test run is long enough to look like a hang. Paying it
      // up front instead — one at a time and only once the server is listening,
      // so it never competes with the first page loads for CPU.
      const prewarm = async (): Promise<void> => {
        for (const handlerPath of routes.values()) {
          try {
            await server.ssrLoadModule(handlerPath)
          } catch {
            // A handler that cannot load will report itself on first request.
          }
        }
      }

      server.httpServer?.once('listening', () => {
        void prewarm()
      })

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''

        if (!url.startsWith(API_PREFIX)) {
          next()
          return
        }

        const path = url.split('?')[0]
        const handlerPath = routes.get(path)

        if (!handlerPath) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'NOT_FOUND' }))
          return
        }

        void (async () => {
          try {
            // Loaded through Vite so TypeScript and the `.ts` import specifiers
            // the handlers use both resolve, and so an edit takes effect
            // without restarting the server.
            const module = await server.ssrLoadModule(handlerPath)
            const handler = module.default as
              | ((request: unknown, response: VercelLikeResponse) => Promise<void>)
              | undefined

            if (typeof handler !== 'function') {
              throw new Error(`${path} has no default export to call`)
            }

            await handler(
              {
                method: req.method,
                headers: req.headers,
                body: await readBody(req),
              },
              adaptResponse(res),
            )
          } catch (error) {
            // Surfaced in the terminal because this is the developer's own
            // machine; the response stays as uninformative as production's.
            server.config.logger.error(
              `[api] ${req.method} ${path} failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            )

            if (!res.writableEnded) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'ERROR' }))
            }
          }
        })()
      })
    },
  }
}
