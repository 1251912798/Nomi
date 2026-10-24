import { describe, expect, it } from "vitest";

import { readVerbs } from "./readVerbs";

describe("read verb declarations", () => {
  it("keeps look_at_canvas as a no-argument read", () => {
    const lookAtCanvas = readVerbs().find((verb) => verb.name === "look_at_canvas");
    expect(lookAtCanvas).toBeDefined();
    expect(lookAtCanvas?.effect).toBe("read");
    expect(lookAtCanvas?.schema.safeParse({}).success).toBe(true);
    expect(lookAtCanvas?.schema.safeParse({ extra: 1 }).success).toBe(false);
  });
});
