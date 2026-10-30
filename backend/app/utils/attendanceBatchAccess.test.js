import assert from "node:assert/strict";
import test from "node:test";
import {
  getAssignedAttendanceBatchIds,
  isAttendanceBatchAssigned,
} from "./attendanceBatchAccess.js";

test("super admins have unrestricted attendance batch access", () => {
  assert.equal(getAssignedAttendanceBatchIds({ isSuperAdmin: true }), null);
  assert.equal(
    isAttendanceBatchAssigned(
      { isSuperAdmin: true, attendanceBatchIds: [] },
      "batch-1",
    ),
    true,
  );
});

test("assigned attendance batch scope is unique and denies unassigned batches", () => {
  const user = {
    attendanceBatchIds: ["batch-1", "batch-1", "batch-2"],
  };

  assert.deepEqual(getAssignedAttendanceBatchIds(user), ["batch-1", "batch-2"]);
  assert.equal(isAttendanceBatchAssigned(user, "batch-1"), true);
  assert.equal(isAttendanceBatchAssigned(user, "batch-3"), false);
  assert.equal(isAttendanceBatchAssigned({}, "batch-1"), false);
});
