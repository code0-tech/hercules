export abstract class BaseManager<K, V> {
    readonly cache = new Map<K, V>();

    get size(): number {
        return this.cache.size;
    }

    get(key: K): V | undefined {
        return this.cache.get(key);
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    set(key: K, value: V): this {
        this.cache.set(key, value);
        return this;
    }

    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    values(): V[] {
        return [...this.cache.values()];
    }

    keys(): K[] {
        return [...this.cache.keys()];
    }

    entries(): [K, V][] {
        return [...this.cache.entries()];
    }

    find(predicate: (value: V, key: K) => boolean): V | undefined {
        for (const [key, value] of this.cache) {
            if (predicate(value, key)) return value;
        }
        return undefined;
    }

    filter(predicate: (value: V, key: K) => boolean): V[] {
        const result: V[] = [];
        for (const [key, value] of this.cache) {
            if (predicate(value, key)) result.push(value);
        }
        return result;
    }

    map<T>(fn: (value: V, key: K) => T): T[] {
        const result: T[] = [];
        for (const [key, value] of this.cache) {
            result.push(fn(value, key));
        }
        return result;
    }

    some(predicate: (value: V, key: K) => boolean): boolean {
        for (const [key, value] of this.cache) {
            if (predicate(value, key)) return true;
        }
        return false;
    }

    every(predicate: (value: V, key: K) => boolean): boolean {
        for (const [key, value] of this.cache) {
            if (!predicate(value, key)) return false;
        }
        return true;
    }

    forEach(fn: (value: V, key: K) => void): void {
        this.cache.forEach((value, key) => fn(value, key));
    }

    [Symbol.iterator](): IterableIterator<[K, V]> {
        return this.cache[Symbol.iterator]();
    }
}
