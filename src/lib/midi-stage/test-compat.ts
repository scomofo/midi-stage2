import { describe, it } from "node:test";
import assert from "node:assert/strict";

function partial(actual: any, expected: any) {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    for (const [key, value] of Object.entries(expected)) partial(actual?.[key], value);
    return;
  }
  assert.deepEqual(actual, expected);
}

export { describe, it };

export function expect(actual: any): any {
  const api: any = {
    toBe: (expected: any) => assert.equal(actual, expected),
    toEqual: (expected: any) => assert.deepEqual(actual, expected),
    toHaveLength: (expected: number) => assert.equal(actual?.length, expected),
    toBeLessThan: (expected: number) => assert.ok(actual < expected),
    toBeLessThanOrEqual: (expected: number) => assert.ok(actual <= expected),
    toBeGreaterThan: (expected: number) => assert.ok(actual > expected),
    toBeGreaterThanOrEqual: (expected: number) => assert.ok(actual >= expected),
    toBeTruthy: () => assert.ok(actual),
    toBeFalsy: () => assert.ok(!actual),
    toBeNull: () => assert.equal(actual, null),
    toBeDefined: () => assert.notEqual(actual, undefined),
    toContain: (expected: any) => assert.ok(actual?.includes(expected)),
    toMatch: (expected: RegExp | string) => assert.match(String(actual), expected instanceof RegExp ? expected : new RegExp(expected)),
    toMatchObject: (expected: any) => partial(actual, expected),
    toBeCloseTo: (expected: number, digits = 2) => assert.ok(Math.abs(actual - expected) <= 0.5 * 10 ** -digits),
    toBeInstanceOf: (expected: any) => assert.ok(actual instanceof expected),
    toThrow: (expected?: RegExp | string) => {
      assert.equal(typeof actual, "function");
      if (expected === undefined) assert.throws(actual);
      else assert.throws(actual, expected instanceof RegExp ? expected : new RegExp(expected));
    },
  };
  api.not = {
    toBe: (expected: any) => assert.notEqual(actual, expected),
    toEqual: (expected: any) => assert.notDeepEqual(actual, expected),
    toContain: (expected: any) => assert.ok(!actual?.includes(expected)),
    toBeNull: () => assert.notEqual(actual, null),
  };
  return api;
}
