import { describe, expect, it } from "vitest";
import { humanizeEntityType } from "@/components/settings/my-activity-tab";

describe("humanizeEntityType", () => {
  it("converts a single-word entityType to title case", () => {
    expect(humanizeEntityType("LEAD")).toBe("Lead");
  });

  it("converts an underscore-separated entityType into title-cased words", () => {
    expect(humanizeEntityType("EXPORT_REQUEST")).toBe("Export Request");
  });

  it("handles a 3-word entityType", () => {
    expect(humanizeEntityType("CALL_DISPOSITION_GROUP")).toBe("Call Disposition Group");
  });

  it("handles an already-single-letter or short segment without throwing", () => {
    expect(humanizeEntityType("COMMAND")).toBe("Command");
  });
});
