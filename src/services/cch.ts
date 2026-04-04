/**
 * cch (client content hash) computation for Anthropic API request signing.
 *
 * The cch field in x-anthropic-billing-header is an xxHash64-based integrity
 * hash over the serialized request body. Algorithm:
 * 1. Build request body with cch=00000 as placeholder
 * 2. Compute xxHash64(body_bytes, seed=0x6E52736AC806831E) & 0xFFFFF
 * 3. Format as zero-padded 5-character lowercase hex
 * 4. Replace cch=00000 with the computed value in the body
 *
 * Reference: https://a10k.co/b/reverse-engineering-claude-code-cch.html
 */

import xxhash from 'xxhash-wasm'

export const CCH_PLACEHOLDER = 'cch=00000'
const SEED = BigInt('0x6E52736AC806831E')
const MASK = BigInt('0xFFFFF')

type XxHashInstance = Awaited<ReturnType<typeof xxhash>>
let _instance: XxHashInstance | null = null

// Eagerly start WASM initialization so it's ready before the first API call.
// The promise is cached; concurrent callers all await the same init.
const _initPromise = xxhash().then(h => {
  _instance = h
})

async function getHasher(): Promise<XxHashInstance> {
  if (!_instance) await _initPromise
  return _instance!
}

export function hasCchPlaceholder(body: string): boolean {
  return body.includes(CCH_PLACEHOLDER)
}

/**
 * Compute the cch value for the given request body bytes.
 * Uses xxhash-wasm (works on Bun and Node.js), masked to 20 bits (5 hex chars).
 * Async only on the very first call while WASM loads; subsequent calls resolve instantly.
 */
export async function computeCch(bodyBytes: Uint8Array): Promise<string> {
  const hasher = await getHasher()
  const h = hasher.create64(SEED)
  h.update(bodyBytes)
  return (h.digest() & MASK).toString(16).padStart(5, '0')
}

export function replaceCchPlaceholder(body: string, cch: string): string {
  return body.replace(CCH_PLACEHOLDER, `cch=${cch}`)
}
