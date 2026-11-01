import { describe, expect, it } from "vitest";
import { readFeature, readFinding, statePaths } from "./state.js";

describe("state record paths", () => {
  it("rejects path-like record IDs before filesystem access", async () => {
    const paths = statePaths("/missing/state");

    await expect(readFinding(paths, "../project")).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(readFeature(paths, "nested/feature")).rejects.toMatchObject({
      code: "invalid-input",
    });
  });
});
