/**
 * Tests for the shared AI provider adapter — specifically the pure,
 * dependency-free pieces of the structured-output path: turning a raw model
 * reply into JSON, and recognising when OpenAI's Responses API cut a reply
 * short. These are exactly the pieces implicated in the Morning Brief
 * "malformed JSON" fallback: a request that runs out of its token budget
 * mid-answer used to be handed to `extractJson` as if it were complete,
 * which failed with a generic parse error instead of a diagnosable
 * "incomplete-output" one.
 *
 * Run with:  npm test
 *
 * `provider.ts` has no imports of its own, so it can be loaded directly by
 * Node's test runner the same way every other pure module in this project
 * is, without going through `tsc`'s module resolution.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractJson,
  extractOpenAiText,
  isOpenAiResponseIncomplete,
  AiRequestError,
} from "./provider.ts";

const config = { provider: "openai", apiKey: "test-key", model: "gpt-5-mini" };

// ---------------------------------------------------------------------------
// extractJson — valid structured output
// ---------------------------------------------------------------------------

test("extractJson parses a plain JSON object", () => {
  const result = extractJson(
    '{"emails":[{"category":"CAN_WAIT","isActionToday":false,"reason":"fyi"}],"recommendation":"Nothing urgent."}',
    config
  );

  assert.deepEqual(result, {
    emails: [{ category: "CAN_WAIT", isActionToday: false, reason: "fyi" }],
    recommendation: "Nothing urgent.",
  });
});

test("extractJson unwraps a fenced ```json code block", () => {
  const text = [
    "Here is the answer:",
    "```json",
    '{"currentPriority":"Ship the fix","nextMove":"Open a PR"}',
    "```",
  ].join("\n");

  const result = extractJson(text, config);

  assert.deepEqual(result, {
    currentPriority: "Ship the fix",
    nextMove: "Open a PR",
  });
});

test("extractJson tolerates surrounding prose around a single object", () => {
  const result = extractJson(
    'Sure, here you go: {"a":1,"b":2} — let me know if you need anything else.',
    config
  );

  assert.deepEqual(result, { a: 1, b: 2 });
});

// ---------------------------------------------------------------------------
// extractJson — malformed / truncated model output
// ---------------------------------------------------------------------------

test("extractJson throws a json-parse AiRequestError on truncated JSON", () => {
  // What a reasoning model's response looks like when it runs out of
  // max_output_tokens partway through the emails array: the first entry
  // closed cleanly, so a "{" and a "}" both exist, but the array and the
  // outer object never closed — so the substring between them is not valid
  // JSON on its own.
  const truncated =
    '{"emails":[{"category":"MONEY_AND_ACCOUNTS","isActionToday":true,"reason":"Failed payment for VEED"}';

  assert.throws(
    () => extractJson(truncated, config),
    (error) => {
      assert.ok(error instanceof AiRequestError);
      assert.equal(error.diagnostics?.stage, "json-parse");
      assert.equal(error.diagnostics?.provider, "openai");
      assert.equal(error.diagnostics?.model, "gpt-5-mini");
      return true;
    }
  );
});

test("extractJson throws a json-parse AiRequestError on trailing-comma JSON", () => {
  assert.throws(
    () => extractJson('{"a":1,"b":2,}', config),
    (error) => {
      assert.ok(error instanceof AiRequestError);
      assert.equal(error.diagnostics?.stage, "json-parse");
      return true;
    }
  );
});

test("extractJson throws a no-json AiRequestError when there is no object at all", () => {
  assert.throws(
    () => extractJson("I cannot help with that right now.", config),
    (error) => {
      assert.ok(error instanceof AiRequestError);
      assert.equal(error.diagnostics?.stage, "no-json");
      return true;
    }
  );
});

test("extractJson throws no-json on an empty string", () => {
  assert.throws(
    () => extractJson("", config),
    (error) => {
      assert.equal(error.diagnostics?.stage, "no-json");
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// extractOpenAiText — Responses API payload shape
// ---------------------------------------------------------------------------

test("extractOpenAiText reads the message item's output_text", () => {
  const payload = {
    status: "completed",
    output: [
      { type: "reasoning" },
      {
        type: "message",
        content: [{ type: "output_text", text: '{"ok":true}' }],
      },
    ],
  };

  assert.equal(extractOpenAiText(payload), '{"ok":true}');
});

test("extractOpenAiText joins multiple output_text parts and ignores others", () => {
  const payload = {
    output: [
      {
        type: "message",
        content: [
          { type: "output_text", text: '{"a":1' },
          { type: "refusal", text: "should be ignored" },
          { type: "output_text", text: "}" },
        ],
      },
    ],
  };

  assert.equal(extractOpenAiText(payload), '{"a":1}');
});

test("extractOpenAiText returns an empty string with no message item", () => {
  assert.equal(extractOpenAiText({ output: [{ type: "reasoning" }] }), "");
  assert.equal(extractOpenAiText({}), "");
});

// ---------------------------------------------------------------------------
// isOpenAiResponseIncomplete — the truncation signal itself
// ---------------------------------------------------------------------------

test("isOpenAiResponseIncomplete is true when status is incomplete", () => {
  assert.equal(
    isOpenAiResponseIncomplete({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    }),
    true
  );
});

test("isOpenAiResponseIncomplete is false when the response completed normally", () => {
  assert.equal(isOpenAiResponseIncomplete({ status: "completed" }), false);
});

test("isOpenAiResponseIncomplete is false when status is absent", () => {
  assert.equal(isOpenAiResponseIncomplete({}), false);
});
