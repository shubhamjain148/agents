/**
 * The registry behind `Agent.retryable()`.
 *
 * The runtime only treats a Durable Object RPC call as retryable if the
 * exact function it calls was passed to `retryable()`, and Agent replaces
 * public methods with per-class context wrappers. Opt-ins are recorded per
 * class so a class's wrappers are marked only for methods that the class
 * or one of its ancestors registered, never a sibling.
 */
import { retryable } from "cloudflare:durable-objects";

type Method = (...args: never[]) => unknown;

const retryableByClass = new WeakMap<Function, WeakSet<Function>>();

/**
 * Register methods as retryable for `cls` and its subclasses. Only methods
 * `cls` defines itself get the runtime mark directly: an inherited function
 * is shared with sibling classes, so it is marked through its wrapper.
 */
export function markRetryable(cls: Function, methods: Method[]): void {
  if (!methods.every((method) => typeof method === "function")) {
    throw new TypeError("retryable() accepts only functions.");
  }
  const own = new Set(
    Object.values(Object.getOwnPropertyDescriptors(cls.prototype)).map(
      (descriptor) => descriptor.value
    )
  );
  retryable(...methods.filter((method) => own.has(method)));

  const registered = retryableByClass.get(cls) ?? new WeakSet();
  for (const method of methods) registered.add(method);
  retryableByClass.set(cls, registered);
}

/** @internal Whether `cls` or an ancestor registered `method`. */
export function isRetryableFor(cls: Function, method: Function): boolean {
  for (let c: Function | null = cls; c; c = Object.getPrototypeOf(c)) {
    if (retryableByClass.get(c)?.has(method)) return true;
  }
  return false;
}
