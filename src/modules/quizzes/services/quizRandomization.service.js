function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function selectQuestions(questions, quiz) {
  let selected = [...questions];
  if (quiz.questionSelectionMode === 'random_count' && quiz.questionsToSelect) {
    selected = shuffle(selected).slice(0, Math.min(quiz.questionsToSelect, selected.length));
  }
  if (quiz.randomizeQuestions) {
    selected = shuffle(selected);
  } else {
    selected.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return selected;
}

export function maybeShuffleOptions(question, randomizeAnswers) {
  const q = {
    ...(question.toObject ? question.toObject() : question),
  };
  if (randomizeAnswers && Array.isArray(q.options) && q.options.length > 1) {
    q.options = shuffle(q.options).map((o, i) => ({ ...o, sortOrder: i }));
  }
  return q;
}

export function buildQuestionSnapshot(questionDoc, randomizeAnswers) {
  const q = maybeShuffleOptions(questionDoc, randomizeAnswers);
  return {
    questionId: q._id,
    questionText: q.questionText,
    questionType: q.questionType,
    description: q.description || '',
    marks: q.marks,
    negativeMarks: q.negativeMarks || 0,
    isRequired: q.isRequired !== false,
    explanation: q.explanation || '',
    options: q.options || [],
    correctOptionIds: q.correctOptionIds || [],
    correctAnswer: q.correctAnswer,
    acceptedAnswers: q.acceptedAnswers || [],
    answerMatchingMode: q.answerMatchingMode,
    gradingMode: q.gradingMode || (q.questionType === 'long_answer' ? 'manual' : 'auto'),
    gradingRubric: q.gradingRubric || [],
    blanks: q.blanks || [],
    sortOrder: q.sortOrder,
  };
}
