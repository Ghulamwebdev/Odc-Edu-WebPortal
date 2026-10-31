const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const hasDefinedValue = (value) => value !== undefined && value !== null;

const addMonths = (dateValue, monthsToAdd) => {
  const date = new Date(dateValue);
  date.setMonth(date.getMonth() + monthsToAdd);
  return date;
};

const getCourseFee = (installment) =>
  Number(installment?.feeComponents?.courseFee || 0);

const isPaid = (installment) =>
  Number(installment?.paidAmount || 0) > 0 ||
  ["Paid", "Partial"].includes(installment?.status);

const getFeeComponentTypes = (installment) =>
  Object.entries(installment?.feeComponents || {})
    .filter(([, amount]) => Number(amount || 0) > 0)
    .map(([type]) => type);

const hasSameFeeType = (left, right) => {
  const leftTypes = getFeeComponentTypes(left);
  const rightTypes = getFeeComponentTypes(right);

  if (leftTypes.length && rightTypes.length) {
    return leftTypes.some((type) => rightTypes.includes(type));
  }

  const leftDescription = String(left?.description || "").toLowerCase();
  const rightDescription = String(right?.description || "").toLowerCase();
  const feeType = (description) =>
    ["course", "exam", "registration", "practical", "certificate", "admission"]
      .find((type) => description.includes(type)) || "";

  return feeType(leftDescription) === feeType(rightDescription);
};

const getMedian = (values) => {
  const sorted = values.map(round2).sort((left, right) => left - right);
  if (!sorted.length) return null;

  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : round2((sorted[middle - 1] + sorted[middle]) / 2);
};

export const getCourseInstallmentCount = (installments = []) =>
  installments.filter(
    (installment) =>
      getCourseFee(installment) > 0 ||
      String(installment?.description || "").toLowerCase().includes("course fee"),
  ).length;

export const getMonthlyCourseInstallmentAmount = (
  existingInstallments = [],
  updatedInstallments = [],
) => {
  const paidAmounts = existingInstallments
    .filter(isPaid)
    .map(getCourseFee)
    .filter((amount) => amount > 0);

  if (paidAmounts.length) return getMedian(paidAmounts);

  const scheduledAmounts = updatedInstallments
    .map(getCourseFee)
    .filter((amount) => amount > 0);

  return getMedian(scheduledAmounts);
};

const getInstallmentsTotal = (installments) =>
  round2(
    installments.reduce((sum, item) => sum + Number(item?.amount || 0), 0),
  );

const addToLastFeeComponent = (installment, difference) => {
  const feeComponents = { ...(installment.feeComponents || {}) };
  const componentKey =
    Number(feeComponents.courseFee || 0) > 0
      ? "courseFee"
      : Object.keys(feeComponents).find((key) => Number(feeComponents[key] || 0) > 0) ||
        "courseFee";

  feeComponents[componentKey] = round2(
    Number(feeComponents[componentKey] || 0) + difference,
  );
  installment.feeComponents = feeComponents;
  installment.amount = round2(Number(installment.amount || 0) + difference);
};

export const mergeInstallmentsPreservingPaid = (
  existingInstallments = [],
  updatedInstallments = [],
  targetTotal,
  {
    preserveScheduledAmounts = false,
    monthlyCourseAmount = null,
  } = {},
) => {
  const existing = Array.isArray(existingInstallments) ? existingInstallments : [];
  const paidInstallments = existing
    .filter(isPaid)
    .map((installment) => ({
      ...installment,
      installmentNumber: Number(installment.installmentNumber),
    }));
  const paidByNumber = new Map(
    paidInstallments.map((installment) => [
      installment.installmentNumber,
      installment,
    ]),
  );
  const updated = Array.isArray(updatedInstallments) ? updatedInstallments : [];
  const paidMatchByIndex = new Map();
  const matchedPaidNumbers = new Set();

  updated.forEach((installment, index) => {
    const paidInstallment = paidByNumber.get(
      Number(installment.installmentNumber),
    );
    if (paidInstallment && hasSameFeeType(paidInstallment, installment)) {
      paidMatchByIndex.set(index, paidInstallment);
      matchedPaidNumbers.add(paidInstallment.installmentNumber);
    }
  });

  paidInstallments.forEach((paidInstallment) => {
    if (matchedPaidNumbers.has(paidInstallment.installmentNumber)) return;

    const matchingIndex = updated.findIndex(
      (installment, index) =>
        !paidMatchByIndex.has(index) &&
        hasSameFeeType(paidInstallment, installment) &&
        String(installment?.description || "").trim().toLowerCase() ===
          String(paidInstallment?.description || "").trim().toLowerCase(),
    );
    if (matchingIndex >= 0) {
      paidMatchByIndex.set(matchingIndex, paidInstallment);
      matchedPaidNumbers.add(paidInstallment.installmentNumber);
    }
  });

  const paidNumbers = new Set(paidInstallments.map((item) => item.installmentNumber));
  const usedNumbers = new Set(paidNumbers);
  const maxExistingNumber = existing.reduce(
    (max, item) => Math.max(max, Number(item?.installmentNumber) || 0),
    0,
  );
  let nextAvailableNumber = maxExistingNumber + 1;
  let renumberFollowingRows = false;
  const merged = [];
  const retainedPaidNumbers = new Set();

  updated.forEach((updatedInstallment, index) => {
    const installmentNumber = Number(updatedInstallment.installmentNumber);
    const paidInstallment = paidMatchByIndex.get(index);

    if (paidInstallment) {
      merged.push(paidInstallment);
      retainedPaidNumbers.add(paidInstallment.installmentNumber);
      return;
    }

    if (paidByNumber.has(installmentNumber) || usedNumbers.has(installmentNumber)) {
      renumberFollowingRows = true;
    }

    let resolvedNumber = installmentNumber;
    if (renumberFollowingRows) {
      while (usedNumbers.has(nextAvailableNumber)) nextAvailableNumber += 1;
      resolvedNumber = nextAvailableNumber;
      nextAvailableNumber += 1;
    }

    usedNumbers.add(resolvedNumber);
    const installment = {
      ...updatedInstallment,
      installmentNumber: resolvedNumber,
    };

    if (preserveScheduledAmounts && monthlyCourseAmount > 0) {
      const courseFee = getCourseFee(installment);
      if (courseFee > 0) {
        const difference = round2(monthlyCourseAmount - courseFee);
        installment.feeComponents = {
          ...installment.feeComponents,
          courseFee: round2(monthlyCourseAmount),
        };
        installment.amount = round2(
          Number(installment.amount || 0) + difference,
        );
      }
    }

    merged.push(installment);
  });

  for (const paidInstallment of paidInstallments) {
    if (!retainedPaidNumbers.has(paidInstallment.installmentNumber)) {
      merged.push(paidInstallment);
    }
  }

  const sortedInstallments = merged.sort(
    (left, right) =>
      Number(left.installmentNumber) - Number(right.installmentNumber),
  );

  if (!hasDefinedValue(targetTotal)) return sortedInstallments;

  if (preserveScheduledAmounts) {
    const currentTotal = getInstallmentsTotal(sortedInstallments);
    const difference = round2(Number(targetTotal) - currentTotal);

    if (difference > 0) {
      const lastUnpaid = [...sortedInstallments]
        .reverse()
        .find((item) => !paidNumbers.has(Number(item.installmentNumber)));
      if (lastUnpaid) {
        addToLastFeeComponent(lastUnpaid, difference);
      }
    }

    return sortedInstallments;
  }

  const paidTotal = getInstallmentsTotal(
    sortedInstallments.filter((item) =>
      paidNumbers.has(Number(item.installmentNumber)),
    ),
  );
  const targetUnpaidTotal = round2(Math.max(0, Number(targetTotal) - paidTotal));
  const unpaidInstallments = sortedInstallments.filter(
    (item) => !paidNumbers.has(Number(item.installmentNumber)),
  );

  if (unpaidInstallments.length === 0 && targetUnpaidTotal > 0) {
    const lastInstallment = sortedInstallments[sortedInstallments.length - 1];
    sortedInstallments.push({
      installmentNumber: Number(lastInstallment?.installmentNumber || 0) + 1,
      description: "Additional Installment",
      feeComponents: {
        admissionFee: 0,
        courseFee: targetUnpaidTotal,
        certificateFee: 0,
        examFee: 0,
        registrationFee: 0,
        practicalFee: 0,
        otherFee: 0,
      },
      amount: targetUnpaidTotal,
      dueDate: addMonths(lastInstallment?.dueDate || new Date(), 1),
      status: "Pending",
      paidAmount: 0,
    });
    return sortedInstallments;
  }

  const currentUnpaidTotal = getInstallmentsTotal(unpaidInstallments);
  let assignedAmount = 0;
  const lastUnpaid = unpaidInstallments[unpaidInstallments.length - 1];

  sortedInstallments.forEach((installment) => {
    if (paidNumbers.has(Number(installment.installmentNumber))) return;

    const isLastUnpaid = installment === lastUnpaid;
    const amount =
      currentUnpaidTotal > 0 && !isLastUnpaid
        ? round2(
            (Number(installment.amount || 0) / currentUnpaidTotal) *
              targetUnpaidTotal,
          )
        : isLastUnpaid
          ? round2(targetUnpaidTotal - assignedAmount)
          : 0;
    assignedAmount = round2(assignedAmount + amount);

    const components = Object.entries(installment.feeComponents || {}).filter(
      ([key]) =>
        [
          "admissionFee",
          "courseFee",
          "certificateFee",
          "examFee",
          "registrationFee",
          "practicalFee",
          "otherFee",
        ].includes(key),
    );
    const componentTotal = round2(
      components.reduce((sum, [, value]) => sum + Number(value || 0), 0),
    );
    let assignedComponents = 0;
    const feeComponents = Object.fromEntries(
      components.map(([key, value], index) => {
        const isLastComponent = index === components.length - 1;
        const componentAmount =
          componentTotal > 0 && !isLastComponent
            ? round2((Number(value || 0) / componentTotal) * amount)
            : isLastComponent
              ? round2(amount - assignedComponents)
              : 0;
        assignedComponents = round2(assignedComponents + componentAmount);
        return [key, componentAmount];
      }),
    );

    if (components.length === 0) {
      feeComponents.courseFee = amount;
    }

    installment.amount = amount;
    installment.feeComponents = feeComponents;
  });

  return sortedInstallments;
};
