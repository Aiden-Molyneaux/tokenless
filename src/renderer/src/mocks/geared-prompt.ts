// Mock geared-prompt content for visual development of GearReviewPane.
// Phase 5 replaces with real Haiku-driven gearing.

export const MOCK_ORIGINAL_PROMPT = `Could you please take a look at the authentication middleware that I've been working on and see if there's any way we can refactor it? The current implementation has some nested conditionals that make the token validation flow really hard to follow, and I'd like to see if there's a cleaner approach. I'm particularly worried about the edge case where the refresh token has expired but the access token is still technically valid — right now we end up with this weird state where the request gets through but then fails downstream when it tries to call an API that needs the refresh. Anyway, take a look and let me know what you think, and feel free to suggest other improvements while you're in there.`

export const MOCK_GEARED_PROMPT = `Refactor src/auth/middleware.ts.

Focus:
1. Token validation flow — flatten nested conditionals.
2. Edge case: refresh token expired + access token still valid — handle explicitly (currently leaks into downstream API errors).

Output: diff only, no preamble, no closing summary.`

export interface MockCritiqueFlag {
  severity: 'info' | 'warn'
  message: string
}

export const MOCK_CRITIQUE_FLAGS: readonly MockCritiqueFlag[] = [
  {
    severity: 'info',
    message: 'Original prompt was 100+ words for a focused refactor — typical compression: 80-90%.'
  },
  {
    severity: 'warn',
    message: 'Original mentions "other improvements while you\'re in there" — open-ended scope. Geared version drops this to keep scope tight. If you want broader review, switch breadth to Thorough.'
  }
]
