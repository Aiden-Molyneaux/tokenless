import { describe, it, expect } from 'vitest'

import { AnsiStripper } from '../../cc/ansi'

// Purpose: AnsiStripper removes ANSI CSI escape sequences from a stream of
// chunks. It handles sequences split across chunks (CSI half in chunk A, the
// rest in chunk B) by buffering an in-progress sequence.

describe('cc/ansi', () => {
  it('strips simple CSI color codes', () => {
    const s = new AnsiStripper()
    expect(s.feed('\x1b[31mred\x1b[0m')).toBe('red')
  })

  it('passes plain text through unchanged', () => {
    const s = new AnsiStripper()
    expect(s.feed('hello world')).toBe('hello world')
  })

  it('handles a sequence split across chunks', () => {
    const s = new AnsiStripper()
    // ESC starts in chunk 1, [31m completes in chunk 2
    expect(s.feed('before\x1b')).toBe('before')
    expect(s.feed('[31mred\x1b[0mafter')).toBe('redafter')
  })

  it('handles incomplete sequence at end of stream', () => {
    const s = new AnsiStripper()
    expect(s.feed('text\x1b[3')).toBe('text')
    // Stripper holds onto the trailing partial; next chunk completes it
    expect(s.feed('1mred')).toBe('red')
  })

  it('strips OSC (operating system command) sequences', () => {
    const s = new AnsiStripper()
    // OSC: ESC ] ... BEL or ESC ] ... ESC \
    expect(s.feed('\x1b]0;title\x07after')).toBe('after')
  })

  it('strips cursor movement', () => {
    const s = new AnsiStripper()
    expect(s.feed('a\x1b[2Db')).toBe('ab')
  })
})
