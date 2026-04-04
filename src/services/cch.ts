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

// Eagerly start WASM initialization at module load time.
// Call initCch() once (e.g. in getAnthropicClient) before using computeCch.
export const initCch: Promise<void> = xxhash().then(h => { _instance = h })

export function hasCchPlaceholder(body: string): boolean {
  return body.includes(CCH_PLACEHOLDER)
}

/**
 * Compute the cch value for the given request body bytes (synchronous).
 * initCch must have been awaited before the first call.
 * Uses xxhash-wasm (works on Bun and Node.js), masked to 20 bits (5 hex chars).
 */
export function computeCch(bodyBytes: Uint8Array): string {
  if (!_instance) throw new Error('cch: xxhash not initialized — await initCch first')
  const h = _instance.create64(SEED)
  h.update(bodyBytes)
  return (h.digest() & MASK).toString(16).padStart(5, '0')
}

export function replaceCchPlaceholder(body: string, cch: string): string {
  return body.replace(CCH_PLACEHOLDER, `cch=${cch}`)
}
