// Fixed-capacity in-memory buffer. Used by the Logger to keep the most
// recent N records available for Dev Mode display without unbounded
// memory growth.

export class RingBuffer<T> {
  private items: T[] = []

  constructor(private readonly capacity: number) {
    if (capacity <= 0) {
      throw new Error(`RingBuffer capacity must be positive, got ${capacity}`)
    }
  }

  push(item: T): void {
    this.items.push(item)
    if (this.items.length > this.capacity) {
      this.items.shift()
    }
  }

  getAll(): readonly T[] {
    return [...this.items]
  }

  size(): number {
    return this.items.length
  }

  clear(): void {
    this.items = []
  }
}
