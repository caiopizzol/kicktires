import { expect, test } from "bun:test";
import { diffAnchors, parseChangedLines } from "../src/review/diff.ts";

const diff =
  "diff --git a/app.cjs b/app.cjs\nindex 123..456 100644\n--- a/app.cjs\n+++ b/app.cjs\n@@ -1,3 +1,3 @@\n first\n-old\n+new\n last\n";

test("diff references identify source coordinates rather than numbered diff rows", () => {
  expect(diff.split("\n")[7]).toBe("+new");
  const anchors = diffAnchors(diff);
  expect(anchors).toEqual(diffAnchors(diff));
  expect(anchors.map(({ file, side, line, text }) => ({ file, side, line, text }))).toEqual([
    { file: "app.cjs", side: "LEFT", line: 2, text: "old" },
    { file: "app.cjs", side: "RIGHT", line: 2, text: "new" },
  ]);
  expect(new Set(anchors.map((a) => a.anchor)).size).toBe(2);
  const original = anchors[1]!.anchor;
  for (const changed of [
    diff.replaceAll("app.cjs", "other.cjs"),
    diff.replace("+1,3", "+9,3"),
    diff.replace("+new", "+different"),
  ])
    expect(diffAnchors(changed)[1]!.anchor).not.toBe(original);
});

test("deleted files and header-like source keep exact changed-line references", () => {
  const removed = "--- a/gone.ts\n+++ /dev/null\n@@ -4,2 +0,0 @@\n-one\n-two\n";
  expect(diffAnchors(removed).map(({ file, side, line }) => ({ file, side, line }))).toEqual([
    { file: "gone.ts", side: "LEFT", line: 4 },
    { file: "gone.ts", side: "LEFT", line: 5 },
  ]);
  const renamed = "--- a/old.ts\n+++ b/new.ts\n@@ -1 +1 @@\n--- source\n+++ source\n";
  expect(diffAnchors(renamed).map((a) => a.file)).toEqual(["new.ts", "new.ts"]);
  expect([...parseChangedLines(renamed).get("new.ts")!.RIGHT]).toEqual([1]);
});

test("preview caps do not discard text from reference identity", () => {
  const long = diff.replace("+new", "+" + "x".repeat(1000));
  const entry = diffAnchors(long)[1]!;
  expect(entry.text).toHaveLength(240);
  expect(diffAnchors(long.replace("x\n last", "y\n last"))[1]!.anchor).not.toBe(entry.anchor);
});
