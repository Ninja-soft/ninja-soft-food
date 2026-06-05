import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils/cn";

describe("scaffolding smoke", () => {
  it("cn merges tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-foreground", false && "hidden")).toBe("text-foreground");
  });
});
