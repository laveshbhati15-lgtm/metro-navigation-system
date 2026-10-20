import { describe, it, expect, beforeEach } from 'vitest';
import { MinHeap } from '@/core/algorithm/MinHeap';

describe('MinHeap', () => {
  let heap: MinHeap<string>;

  beforeEach(() => {
    heap = new MinHeap<string>();
  });

  it('starts empty', () => {
    expect(heap.isEmpty()).toBe(true);
    expect(heap.size).toBe(0);
  });

  it('throws when extracting from empty heap', () => {
    expect(() => heap.extractMin()).toThrow('Heap is empty');
  });

  it('returns the minimum element on extract', () => {
    heap.insert('C', 30);
    heap.insert('A', 10);
    heap.insert('B', 20);

    expect(heap.extractMin().value).toBe('A');
    expect(heap.extractMin().value).toBe('B');
    expect(heap.extractMin().value).toBe('C');
  });

  it('handles duplicate priorities', () => {
    heap.insert('X', 5);
    heap.insert('Y', 5);
    heap.insert('Z', 5);

    // All should extract without error
    expect(heap.extractMin().priority).toBe(5);
    expect(heap.extractMin().priority).toBe(5);
    expect(heap.extractMin().priority).toBe(5);
    expect(heap.isEmpty()).toBe(true);
  });

  it('maintains correct size after operations', () => {
    heap.insert('A', 1);
    heap.insert('B', 2);
    expect(heap.size).toBe(2);
    heap.extractMin();
    expect(heap.size).toBe(1);
    heap.extractMin();
    expect(heap.size).toBe(0);
  });

  it('peek does not remove the element', () => {
    heap.insert('A', 10);
    heap.insert('B', 5);
    expect(heap.peek()?.value).toBe('B');
    expect(heap.size).toBe(2);
  });

  it('handles single element correctly', () => {
    heap.insert('solo', 42);
    expect(heap.extractMin().value).toBe('solo');
    expect(heap.isEmpty()).toBe(true);
  });

  it('handles large random insertion correctly', () => {
    const values = [50, 3, 17, 99, 1, 42, 8, 25];
    values.forEach((v, i) => heap.insert(`node${i}`, v));

    const sorted: number[] = [];
    while (!heap.isEmpty()) {
      sorted.push(heap.extractMin().priority);
    }

    expect(sorted).toEqual([...values].sort((a, b) => a - b));
  });
});
