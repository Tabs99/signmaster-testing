/**
 * The subset of Vercel's request and response objects the handlers use.
 *
 * Typed structurally rather than imported from `@vercel/node` so the handlers
 * can be called from tests, and from the dev-server plugin, with plain objects.
 */

export interface VercelLikeRequest {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}

export interface VercelLikeResponse {
  setHeader(name: string, value: string | string[]): void
  status(code: number): VercelLikeResponse
  json(body: unknown): void
}

export type VercelHandler = (
  req: VercelLikeRequest,
  res: VercelLikeResponse,
) => Promise<void>
