import { test } from "node:test";
import assert from "node:assert";

/**
 * Pure function: cap the list of message IDs to approve based on current count.
 * Returns only the IDs that can be approved without exceeding the cap.
 *
 * @param {string[]} messageIds - List of message IDs to approve
 * @param {number} currentCount - Current number of approved emails
 * @param {number} cap - Maximum approved emails allowed (default 20)
 * @returns {string[]} - Message IDs that can be approved
 */
function capApproveList(messageIds, currentCount, cap = 20) {
  const slots = Math.max(0, cap - currentCount);
  return messageIds.slice(0, slots);
}

test("capApproveList - below cap passes all IDs", () => {
  const ids = ["msg1", "msg2", "msg3"];
  const result = capApproveList(ids, 15, 20);
  assert.deepStrictEqual(result, ["msg1", "msg2", "msg3"]);
});

test("capApproveList - at cap returns empty list", () => {
  const ids = ["msg1", "msg2", "msg3"];
  const result = capApproveList(ids, 20, 20);
  assert.deepStrictEqual(result, []);
});

test("capApproveList - over cap returns empty list", () => {
  const ids = ["msg1", "msg2"];
  const result = capApproveList(ids, 25, 20);
  assert.deepStrictEqual(result, []);
});

test("capApproveList - truncates when exceeding available slots", () => {
  const ids = ["msg1", "msg2", "msg3", "msg4"];
  const result = capApproveList(ids, 18, 20);
  assert.deepStrictEqual(result, ["msg1", "msg2"]);
});

test("capApproveList - exact number of available slots", () => {
  const ids = ["msg1", "msg2", "msg3"];
  const result = capApproveList(ids, 17, 20);
  assert.deepStrictEqual(result, ["msg1", "msg2", "msg3"]);
});

test("capApproveList - empty input returns empty", () => {
  const ids = [];
  const result = capApproveList(ids, 10, 20);
  assert.deepStrictEqual(result, []);
});

test("capApproveList - respects custom cap", () => {
  const ids = ["msg1", "msg2", "msg3"];
  const result = capApproveList(ids, 8, 10);
  assert.deepStrictEqual(result, ["msg1", "msg2"]);
});
