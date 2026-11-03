/** Admin sees full answer keys */
export function serializeQuestionForAdmin(q) {
  const obj = q.toObject ? q.toObject() : q;
  return {
    id: obj._id?.toString?.() || obj.id,
    quizId: obj.quizId?.toString?.() || obj.quizId,
    questionBankId: obj.questionBankId?.toString?.() || obj.questionBankId || null,
    questionText: obj.questionText,
    questionType: obj.questionType,
    description: obj.description || '',
    marks: obj.marks,
    negativeMarks: obj.negativeMarks || 0,
    sortOrder: obj.sortOrder,
    isRequired: obj.isRequired !== false,
    explanation: obj.explanation || '',
    difficulty: obj.difficulty,
    tags: obj.tags || [],
    options: obj.options || [],
    correctOptionIds: obj.correctOptionIds || [],
    correctAnswer: obj.correctAnswer,
    acceptedAnswers: obj.acceptedAnswers || [],
    answerMatchingMode: obj.answerMatchingMode,
    gradingMode: obj.gradingMode,
    gradingRubric: obj.gradingRubric || [],
    blanks: obj.blanks || [],
    status: obj.status,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

/** Student mid-attempt / start — NO answer keys */
export function serializeQuestionForStudent(snapshot) {
  return {
    id: snapshot.questionId?.toString?.() || snapshot.questionId || snapshot.id,
    questionText: snapshot.questionText,
    questionType: snapshot.questionType,
    description: snapshot.description || '',
    marks: snapshot.marks,
    isRequired: snapshot.isRequired !== false,
    sortOrder: snapshot.sortOrder,
    options: (snapshot.options || []).map((o) => ({
      id: o.id,
      text: o.text,
      image: o.image || null,
      sortOrder: o.sortOrder,
    })),
    blanks: (snapshot.blanks || []).map((b) => ({
      id: b.id,
      marks: b.marks,
      // never expose acceptedAnswers
    })),
    gradingMode: snapshot.gradingMode === 'manual' ? 'manual' : 'auto',
  };
}

/** Result view — optional keys based on quiz settings */
export function serializeQuestionForResult(snapshot, answer, { showCorrect, showExplanation }) {
  const base = serializeQuestionForStudent(snapshot);
  const result = {
    ...base,
    studentAnswer: {
      selectedOptionIds: answer?.selectedOptionIds,
      booleanAnswer: answer?.booleanAnswer,
      text: answer?.text,
      blankAnswers: answer?.blankAnswers,
    },
    isCorrect: answer?.isCorrect,
    marksAwarded: answer?.marksAwarded,
    negativeApplied: answer?.negativeApplied || 0,
    feedback: answer?.feedback || '',
    needsManualGrading: Boolean(answer?.needsManualGrading),
  };
  if (showCorrect) {
    result.correctOptionIds = snapshot.correctOptionIds;
    result.correctAnswer = snapshot.correctAnswer;
    result.acceptedAnswers = snapshot.acceptedAnswers;
    result.blanks = snapshot.blanks;
  }
  if (showExplanation) {
    result.explanation = snapshot.explanation || '';
  }
  return result;
}
