/**
 * MinHeap — generic min-heap (priority queue) used by Dijkstra's algorithm.
 *
 * Time complexity:
 *   insert  — O(log n)
 *   extract — O(log n)
 *   peek    — O(1)
 */

interface HeapNode<T> {
  priority: number;
  value: T;
}

export class MinHeap<T> {
  private readonly heap: HeapNode<T>[] = [];

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  insert(value: T, priority: number): void {
    this.heap.push({ priority, value });
    this.bubbleUp(this.heap.length - 1);
  }

  extractMin(): HeapNode<T> {
    if (this.isEmpty()) throw new Error('Heap is empty');

    const min = this.heap[0];
    const last = this.heap.pop()!;

    if (!this.isEmpty()) {
      this.heap[0] = last;
      this.sinkDown(0);
    }

    return min;
  }

  peek(): HeapNode<T> | undefined {
    return this.heap[0];
  }

  /** Return a snapshot of the heap contents (for visualizer) */
  toArray(): Array<{ node: T; dist: number }> {
    return this.heap.map(n => ({ node: n.value, dist: n.priority }));
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].priority <= this.heap[index].priority) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const left  = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < length && this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }
      if (right < length && this.heap[right].priority < this.heap[smallest].priority) {
        smallest = right;
      }
      if (smallest === index) break;

      [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
      index = smallest;
    }
  }
}
