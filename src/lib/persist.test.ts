import { describe, expect, it } from "vitest";
import { idsToDelete } from "./persist";

describe("idsToDelete", () => {
  it("full replace deletes anything not kept", () => {
    expect(idsToDelete(["a", "b", "c"], ["a", "b"])).toEqual(["c"]);
  });

  it("tombstone-only leaves unknown ids alone", () => {
    expect(idsToDelete(["a", "b", "mcp-row"], ["a"], ["a", "b"])).toEqual(["b"]);
  });

  it("does not delete an id that is still present", () => {
    expect(idsToDelete(["a", "b"], ["a", "b"], ["a", "b"])).toEqual([]);
  });
});
