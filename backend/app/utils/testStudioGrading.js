const normalize = (value) => String(value || "").trim().toLowerCase();

const sameSet = (left = [], right = []) => {
  const leftSet = new Set(left.map(String));
  const rightSet = new Set(right.map(String));
  if (leftSet.size !== rightSet.size) return false;
  return [...leftSet].every((item) => rightSet.has(item));
};

const getQuestionCorrectKeys = (question = {}) => {
  const explicit = (question.correctAnswers || []).map(String).filter(Boolean);
  if (explicit.length) return explicit;
  return (question.options || [])
    .map((option, index) => (option.isCorrect ? String(option._id || index) : null))
    .filter(Boolean);
};

const gradeSingleAnswer = (question = {}, answer = {}, negativeMarking = {}) => {
  const marks = Number(question.marks || 0);
  const penalty = negativeMarking?.enabled
    ? Number(question.negativeMarks || negativeMarking.value || 0)
    : 0;
  const selectedOptions = (answer.selectedOptions || []).map(String).filter(Boolean);
  const textAnswer = normalize(answer.textAnswer);
  const correctKeys = getQuestionCorrectKeys(question);
  let isCorrect = false;
  let autoGraded = true;

  if (["mcq_single", "mcq_multiple", "true_false"].includes(question.questionType)) {
    isCorrect = sameSet(selectedOptions, correctKeys);
  } else {
    const acceptableAnswers = [
      ...(question.correctAnswers || []),
      question.modelAnswer,
    ]
      .map(normalize)
      .filter(Boolean);
    isCorrect = Boolean(textAnswer && acceptableAnswers.includes(textAnswer));
    autoGraded = acceptableAnswers.length > 0;
  }

  const marksAwarded = isCorrect ? marks : Math.max(0, -penalty);

  return {
    questionId: answer.questionId || question._id,
    selectedOptions,
    textAnswer: answer.textAnswer || "",
    marksAwarded,
    autoGraded,
    isCorrect,
    comments: autoGraded ? "" : "Needs teacher review",
    savedAt: new Date(),
  };
};

export const gradeTestAttempt = (test, submittedAnswers = []) => {
  const answerMap = new Map(
    (submittedAnswers || []).map((answer) => [String(answer.questionId), answer]),
  );
  const answers = (test.questions || []).map((question) =>
    gradeSingleAnswer(question, answerMap.get(String(question._id)) || { questionId: question._id }, test.negativeMarking),
  );
  const score = Math.max(0, answers.reduce((sum, answer) => sum + Number(answer.marksAwarded || 0), 0));
  const totalMarks = Number(test.totalMarks || 0);
  const percentage = totalMarks ? Math.round((score / totalMarks) * 10000) / 100 : 0;
  const passed = score >= Number(test.passingMarks || 0);

  return { answers, score, percentage, passed };
};
