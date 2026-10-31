import assert from "node:assert/strict";
import test from "node:test";
import {
  getCourseInstallmentCount,
  getMonthlyCourseInstallmentAmount,
  mergeInstallmentsPreservingPaid,
} from "./installmentExtension.js";

test("extended course installments keep the paid monthly rate and avoid paid-fee number collisions", () => {
  const existingInstallments = [
    ...Array.from({ length: 11 }, (_, index) => ({
      installmentNumber: index + 1,
      description: `Course Fee Installment ${index + 1}`,
      amount: 1700,
      feeComponents: { courseFee: 1700, examFee: 0 },
      status: "Paid",
      paidAmount: 1700,
    })),
    {
      installmentNumber: 12,
      description: "Course Fee Installment 12",
      amount: 21.4,
      feeComponents: { courseFee: 21.4, examFee: 0 },
      status: "Pending",
      paidAmount: 0,
    },
    {
      installmentNumber: 13,
      description: "Exam Fee - Installment 1/2",
      amount: 6000,
      feeComponents: { courseFee: 0, examFee: 6000 },
      status: "Paid",
      paidAmount: 6000,
    },
  ];
  const updatedInstallments = [
    ...Array.from({ length: 15 }, (_, index) => ({
      installmentNumber: index + 1,
      description:
        index === 0
          ? "Admission Fee + Course Fee"
          : index === 14
            ? "Course Fee + Certificate Fee"
            : `Course Fee Installment ${index + 1}`,
      amount: index === 14 ? 35.8 : 21.4,
      feeComponents: {
        courseFee: 21.4,
        certificateFee: index === 14 ? 14.4 : 0,
        examFee: 0,
      },
      status: "Pending",
      paidAmount: 0,
    })),
    {
      installmentNumber: 16,
      description: "Exam Fee - Installment 1/2",
      amount: 6000,
      feeComponents: { courseFee: 0, examFee: 6000 },
      status: "Pending",
      paidAmount: 0,
    },
    {
      installmentNumber: 17,
      description: "Exam Fee - Installment 2/2",
      amount: 6000,
      feeComponents: { courseFee: 0, examFee: 6000 },
      status: "Pending",
      paidAmount: 0,
    },
  ];
  const monthlyCourseAmount = getMonthlyCourseInstallmentAmount(
    existingInstallments,
    updatedInstallments,
  );

  const merged = mergeInstallmentsPreservingPaid(
    existingInstallments,
    updatedInstallments,
    25000,
    { preserveScheduledAmounts: true, monthlyCourseAmount },
  );
  const byNumber = new Map(
    merged.map((installment) => [installment.installmentNumber, installment]),
  );
  const courseRows = merged.filter(
    (installment) => installment.feeComponents.courseFee > 0,
  );

  assert.equal(monthlyCourseAmount, 1700);
  assert.equal(getCourseInstallmentCount(merged), 15);
  assert.equal(merged.length, 17);
  assert.equal(new Set(merged.map((item) => item.installmentNumber)).size, 17);
  assert.equal(byNumber.get(13).description, "Exam Fee - Installment 1/2");
  assert.equal(byNumber.get(13).status, "Paid");
  assert.equal(byNumber.get(12).amount, 1700);
  assert.deepEqual(
    courseRows
      .filter((installment) => installment.installmentNumber >= 12)
      .map((installment) => installment.feeComponents.courseFee),
    [1700, 1700, 1700, 1700],
  );
  assert.ok(
    merged.reduce((sum, installment) => sum + installment.amount, 0) > 25000,
  );
});

test("ordinary fee edits still rebalance unpaid installments to the configured total", () => {
  const merged = mergeInstallmentsPreservingPaid(
    [
      {
        installmentNumber: 1,
        amount: 1000,
        feeComponents: { courseFee: 1000 },
        status: "Paid",
        paidAmount: 1000,
      },
      {
        installmentNumber: 2,
        amount: 1000,
        feeComponents: { courseFee: 1000 },
        status: "Pending",
        paidAmount: 0,
      },
    ],
    [
      {
        installmentNumber: 1,
        amount: 1000,
        feeComponents: { courseFee: 1000 },
        status: "Pending",
        paidAmount: 0,
      },
      {
        installmentNumber: 2,
        amount: 1000,
        feeComponents: { courseFee: 1000 },
        status: "Pending",
        paidAmount: 0,
      },
    ],
    1500,
  );

  assert.equal(merged[0].amount, 1000);
  assert.equal(merged[1].amount, 500);
  assert.equal(merged.reduce((sum, installment) => sum + installment.amount, 0), 1500);
});
