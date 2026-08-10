import assert from "node:assert/strict";
import test from "node:test";

import { safeInternalRedirect } from "./security.ts";
import { containsEveryIdExactlyOnce } from "./task-step-order.ts";

const ORIGIN = "https://app.kurvzos.com";

test("auth redirect accepts a same-origin path with query and hash", () => {
  assert.equal(
    safeInternalRedirect("/dashboard/tasks?view=today#next", ORIGIN),
    "/dashboard/tasks?view=today#next"
  );
});

test("auth redirect accepts a same-origin absolute URL", () => {
  assert.equal(
    safeInternalRedirect("https://app.kurvzos.com/dashboard", ORIGIN),
    "/dashboard"
  );
});

test("auth redirect rejects a cross-origin URL", () => {
  assert.equal(
    safeInternalRedirect("https://evil.example/phish", ORIGIN),
    "/dashboard"
  );
});

test("auth redirect rejects browser-normalized backslash host syntax", () => {
  assert.equal(safeInternalRedirect("/\\\\evil.example", ORIGIN), "/dashboard");
});

test("step order accepts the exact known id set", () => {
  assert.equal(containsEveryIdExactlyOnce(["c", "a", "b"], ["a", "b", "c"]), true);
});

test("step order rejects duplicate ids even when the length matches", () => {
  assert.equal(containsEveryIdExactlyOnce(["a", "a", "c"], ["a", "b", "c"]), false);
});

test("step order rejects a missing id", () => {
  assert.equal(containsEveryIdExactlyOnce(["a", "b"], ["a", "b", "c"]), false);
});

test("step order rejects an unknown replacement id", () => {
  assert.equal(containsEveryIdExactlyOnce(["a", "b", "x"], ["a", "b", "c"]), false);
});
