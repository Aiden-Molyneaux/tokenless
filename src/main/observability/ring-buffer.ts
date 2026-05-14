// Fixed-capacity in-memory buffer with O(1) push. Used by the Logger to keep
// the most recent N records available for Dev Mode display without unbounded
// memory growth.
//
// Implementation: circular buffer with head pointer + count. When the buffer
// is full, push overwrites the oldest slot and advances head — no Array.shift,
// no re-indexing. getAll walks count slots from head to produce a snapshot
// in insertion order. The public API matches the previous Array-based impl
// exactly; all callers and tests work unchanged.

export class RingBuffer<T> {
  private readonly items: (T | undefined)[]
  private head: number = 0
  private count: number = 0

  constructor(private readonly capacity: number) {
    if (capacity <= 0) {
      throw new Error(`RingBuffer capacity must be positive, got ${capacity}`)
    }
    this.items = new Array(capacity)
  }

  push(item: T): void {
    const writeIndex = (this.head + this.count) % this.capacity
    this.items[writeIndex] = item
    if (this.count < this.capacity) {
      this.count++
    } else {
      this.head = (this.head + 1) % this.capacity
    }
  }

  getAll(): readonly T[] {
    const result: T[] = []
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity
      result.push(this.items[idx] as T)
    }
    return result
  }

  size(): number {
    return this.count
  }

  clear(): void {
    this.head = 0
    this.count = 0
    // Items array stays allocated; slots will be overwritten on next push.
  }
}
