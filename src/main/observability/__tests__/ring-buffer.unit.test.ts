import { describe, expect, it } from 'vitest'
import { RingBuffer } from '../ring-buffer'

describe('RingBuffer', () => {
  it('throws on zero or negative capacity', () => {
    expect(() => new RingBuffer<number>(0)).toThrow()
    expect(() => new RingBuffer<number>(-1)).toThrow()
  })

  it('starts empty', () => {
    const rb = new RingBuffer<number>(3)
    expect(rb.size()).toBe(0)
    expect(rb.getAll()).toEqual([])
  })

  it('preserves insertion order up to capacity', () => {
    const rb = new RingBuffer<number>(3)
    rb.push(1)
    rb.push(2)
    rb.push(3)
    expect(rb.size()).toBe(3)
    expect(rb.getAll()).toEqual([1, 2, 3])
  })

  it('evicts oldest item when over capacity', () => {
    const rb = new RingBuffer<number>(3)
    rb.push(1)
    rb.push(2)
    rb.push(3)
    rb.push(4)
    expect(rb.size()).toBe(3)
    expect(rb.getAll()).toEqual([2, 3, 4])
  })

  it('continues to evict after many over-capacity pushes', () => {
    const rb = new RingBuffer<number>(2)
    for (let i = 1; i <= 10; i++) rb.push(i)
    expect(rb.getAll()).toEqual([9, 10])
  })

  it('clear empties the buffer', () => {
    const rb = new RingBuffer<number>(3)
    rb.push(1)
    rb.push(2)
    rb.clear()
    expect(rb.size()).toBe(0)
    expect(rb.getAll()).toEqual([])
  })

  it('getAll returns a defensive copy (mutating it does not affect the buffer)', () => {
    const rb = new RingBuffer<number>(3)
    rb.push(1)
    rb.push(2)
    const snapshot = rb.getAll()
    ;(snapshot as number[]).push(99)
    expect(rb.getAll()).toEqual([1, 2])
  })
})
