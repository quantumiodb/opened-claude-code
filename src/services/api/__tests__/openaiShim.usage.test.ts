import { describe, expect, it } from 'vitest'
import { extractAnthropicUsage } from '../openaiShim.js'

describe('extractAnthropicUsage', () => {
  it('maps prompt and completion tokens', () => {
    expect(
      extractAnthropicUsage({
        prompt_tokens: 1200,
        completion_tokens: 300,
      }),
    ).toEqual({
      input_tokens: 1200,
      output_tokens: 300,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    })
  })

  it('maps prompt_tokens_details.cached_tokens to cache_read_input_tokens', () => {
    expect(
      extractAnthropicUsage({
        prompt_tokens: 1200,
        completion_tokens: 300,
        prompt_tokens_details: {
          cached_tokens: 800,
        },
      }),
    ).toEqual({
      input_tokens: 1200,
      output_tokens: 300,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 800,
    })
  })

  it('defaults missing usage to zero', () => {
    expect(extractAnthropicUsage(undefined)).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    })
  })
})
