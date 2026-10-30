import { getAssignedAttendanceBatchIds } from "../utils/attendanceBatchAccess.js";

const attendanceBatchScope = (req, res, next) => {
  const assignedBatchIds = getAssignedAttendanceBatchIds(req.currentUser);
  if (assignedBatchIds === null) return next();

  const batchId = req.params.batchId || req.body?.batchId;
  if (batchId && batchId !== "__all_batches__" && !assignedBatchIds.includes(String(batchId))) {
    return res.status(403).json({
      success: false,
      message: "You do not have attendance access to this batch.",
    });
  }

  return next();
};

export default attendanceBatchScope;
