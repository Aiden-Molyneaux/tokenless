// AnsiStripper — feeds chunks in, emits same chunks with ANSI escape
// sequences stripped. Handles CSI and OSC. Buffers a partial sequence
// across chunk boundaries so a sequence split mid-stream still gets
// recognized and removed.
//
// CSI: ESC [ <params> <command-letter>
// OSC: ESC ] <params> (BEL | ESC \)
// We treat anything starting with ESC that isn't CSI/OSC as a 2-char
// sequence (ESC + final byte) — covers most short sequences.

const ESC = 0x1b
const BEL = 0x07
const BACKSLASH = 0x5c

type State = 'text' | 'esc' | 'csi' | 'osc' | 'osc-end-esc'

export class AnsiStripper {
  private state: State = 'text'

  feed(chunk: string): string {
    const out: string[] = []
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i)
      switch (this.state) {
        case 'text':
          if (c === ESC) this.state = 'esc'
          else out.push(chunk[i])
          break
        case 'esc':
          if (chunk[i] === '[') this.state = 'csi'
          else if (chunk[i] === ']') this.state = 'osc'
          else this.state = 'text' // 2-char sequence — drop both
          break
        case 'csi':
          // CSI ends at the first byte in 0x40–0x7E
          if (c >= 0x40 && c <= 0x7e) this.state = 'text'
          break
        case 'osc':
          // OSC ends at BEL or ESC \
          if (c === BEL) this.state = 'text'
          else if (c === ESC) this.state = 'osc-end-esc'
          break
        case 'osc-end-esc':
          if (c === BACKSLASH) this.state = 'text'
          else this.state = 'osc' // false alarm — keep eating
          break
      }
    }
    return out.join('')
  }

  // Reset state between conversations (rare — usually one parser per slot for
  // its lifetime).
  reset(): void {
    this.state = 'text'
  }
}
