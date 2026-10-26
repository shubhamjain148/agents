import { env } from "cloudflare:workers";
import { retryable } from "cloudflare:durable-objects";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { isRetryableFor, markRetryable } from "../retryable-methods";
import { originalRetryableRpc } from "./agents/native-rpc";

vi.mock("cloudflare:durable-objects", () => ({ retryable: vi.fn() }));

const marked = (method: Function) =>
  vi.mocked(retryable).mock.calls.some((args) => args.includes(method));

describe("Agent.retryable", () => {
  it("marks the method and the context wrapper that native RPC calls", async () => {
    const namespace = env.TestNativeRpcAgent;
    const stub = namespace.get(
      namespace.idFromName(`retryable-${crypto.randomUUID()}`)
    );

    expect(await stub.retryableRpc()).toBe("retryable");

    const result = await runInDurableObject(stub, (instance) => {
      const prototype = Object.getPrototypeOf(instance);
      return {
        wrapped: prototype.retryableRpc !== originalRetryableRpc,
        originalMarked: marked(originalRetryableRpc),
        wrapperMarked: marked(prototype.retryableRpc),
        otherMethodMarked: marked(prototype.applicationRpc)
      };
    });

    expect(result).toEqual({
      wrapped: true,
      originalMarked: true,
      wrapperMarked: true,
      otherMethodMarked: false
    });
  });

  it("keeps a subclass's opt-in for an inherited method from its siblings", () => {
    class Base {
      inherited() {}
    }
    class Marked extends Base {
      own() {}
    }
    class Child extends Marked {}
    class Sibling extends Base {}

    markRetryable(Marked, [Base.prototype.inherited, Marked.prototype.own]);

    expect(isRetryableFor(Marked, Base.prototype.inherited)).toBe(true);
    expect(isRetryableFor(Child, Base.prototype.inherited)).toBe(true);
    expect(isRetryableFor(Sibling, Base.prototype.inherited)).toBe(false);
    // Sibling reaches the inherited function directly, so only the class's
    // own method gets the runtime mark.
    expect(marked(Marked.prototype.own)).toBe(true);
    expect(marked(Base.prototype.inherited)).toBe(false);
  });
});
