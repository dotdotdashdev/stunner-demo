export class FrameResourceStore {
  private readonly values = new Map<string, unknown>()

  set<T>(name: string, value: T): void {
    this.values.set(name, value)
  }

  get<T>(name: string): T | undefined {
    return this.values.get(name) as T | undefined
  }

  require<T>(name: string): T {
    if (!this.values.has(name)) {
      throw new Error(`Required frame resource '${name}' is missing.`)
    }

    return this.values.get(name) as T
  }

  has(name: string): boolean {
    return this.values.has(name)
  }

  clear(): void {
    this.values.clear()
  }
}
