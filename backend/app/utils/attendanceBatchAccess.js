export const getAssignedAttendanceBatchIds = (user) => {
  if (user?.isSuperAdmin) return null;
  return [...new Set((user?.attendanceBatchIds || []).map(String).filter(Boolean))];
};

export const isAttendanceBatchAssigned = (user, batchId) => {
  const assignedBatchIds = getAssignedAttendanceBatchIds(user);
  return assignedBatchIds === null || assignedBatchIds.includes(String(batchId));
};
