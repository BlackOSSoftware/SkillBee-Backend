/**
 * Server-side scoring.
 * Rounding: percentage to 2 decimal places; obtainedMarks floored at 0.
 * Unanswered questions: no negative marks by default.
 * Multi-select: exact-set match by default; optional partial credit.
 */

function normalizeText(value, mode = 'case_insensitive') {
  let s = String(value ?? '').trim();
  if (mode === 'normalized') {
    s = s.replace(/\s+/g, ' ').toLowerCase();
  } else if (mode === 'case_insensitive') {
    s = s.toLowerCase();
  }
  return s;
}

function setsEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

export function scoreQuestion(snapshot, answer, quizConfig = {}) {
  const type = snapshot.questionType;
  const maxMarks = Number(snapshot.marks) || 0;
  const neg =
    quizConfig.negativeMarkingEnabled
      ? Number(snapshot.negativeMarks || quizConfig.negativeMarksPerWrongAnswer || 0)
      : 0;

  const empty =
    !answer ||
    ((!answer.selectedOptionIds || answer.selectedOptionIds.length === 0) &&
      answer.booleanAnswer === undefined &&
      (answer.text === undefined || answer.text === '') &&
      (!answer.blankAnswers || answer.blankAnswers.length === 0));

  if (empty) {
    return {
      isCorrect: false,
      marksAwarded: 0,
      negativeApplied: 0,
      needsManualGrading: snapshot.gradingMode === 'manual' || type === 'long_answer',
      unanswered: true,
    };
  }

  if (type === 'long_answer' || snapshot.gradingMode === 'manual') {
    return {
      isCorrect: null,
      marksAwarded: null,
      negativeApplied: 0,
      needsManualGrading: true,
      unanswered: false,
    };
  }

  if (type === 'multiple_choice') {
    const selected = answer.selectedOptionIds || [];
    const correct = snapshot.correctOptionIds || [];
    const ok = selected.length === 1 && correct.length === 1 && selected[0] === correct[0];
    return ok
      ? { isCorrect: true, marksAwarded: maxMarks, negativeApplied: 0, needsManualGrading: false }
      : {
          isCorrect: false,
          marksAwarded: 0,
          negativeApplied: neg,
          needsManualGrading: false,
        };
  }

  if (type === 'multiple_select') {
    const selected = [...(answer.selectedOptionIds || [])].sort();
    const correct = [...(snapshot.correctOptionIds || [])].sort();
    if (quizConfig.allowPartialCreditMultiSelect && correct.length > 0) {
      const correctSet = new Set(correct);
      const selectedSet = new Set(selected);
      let hit = 0;
      let wrong = 0;
      for (const id of selectedSet) {
        if (correctSet.has(id)) hit += 1;
        else wrong += 1;
      }
      const missed = correct.length - hit;
      if (wrong === 0 && missed === 0) {
        return {
          isCorrect: true,
          marksAwarded: maxMarks,
          negativeApplied: 0,
          needsManualGrading: false,
        };
      }
      const ratio = Math.max(0, (hit - wrong) / correct.length);
      const awarded = Number((maxMarks * ratio).toFixed(2));
      return {
        isCorrect: awarded === maxMarks,
        marksAwarded: Math.max(0, awarded),
        negativeApplied: awarded <= 0 ? neg : 0,
        needsManualGrading: false,
      };
    }
    const ok = setsEqual(selected, correct);
    return ok
      ? { isCorrect: true, marksAwarded: maxMarks, negativeApplied: 0, needsManualGrading: false }
      : {
          isCorrect: false,
          marksAwarded: 0,
          negativeApplied: neg,
          needsManualGrading: false,
        };
  }

  if (type === 'true_false') {
    const ok = Boolean(answer.booleanAnswer) === Boolean(snapshot.correctAnswer);
    return ok
      ? { isCorrect: true, marksAwarded: maxMarks, negativeApplied: 0, needsManualGrading: false }
      : {
          isCorrect: false,
          marksAwarded: 0,
          negativeApplied: neg,
          needsManualGrading: false,
        };
  }

  if (type === 'short_answer') {
    const mode = snapshot.answerMatchingMode || 'case_insensitive';
    const given = normalizeText(answer.text, mode);
    const ok = (snapshot.acceptedAnswers || []).some(
      (a) => normalizeText(a, mode) === given
    );
    return ok
      ? { isCorrect: true, marksAwarded: maxMarks, negativeApplied: 0, needsManualGrading: false }
      : {
          isCorrect: false,
          marksAwarded: 0,
          negativeApplied: neg,
          needsManualGrading: false,
        };
  }

  if (type === 'fill_in_the_blanks') {
    let awarded = 0;
    let allCorrect = true;
    const blanks = snapshot.blanks || [];
    const responses = answer.blankAnswers || [];
    for (const blank of blanks) {
      const resp = responses.find((r) => r.blankId === blank.id);
      const mode = blank.caseSensitive ? 'exact' : 'case_insensitive';
      const given = normalizeText(resp?.value, mode);
      const ok = (blank.acceptedAnswers || []).some((a) => normalizeText(a, mode) === given);
      if (ok) awarded += Number(blank.marks) || 0;
      else allCorrect = false;
    }
    const wrong = !allCorrect && awarded === 0;
    return {
      isCorrect: allCorrect,
      marksAwarded: awarded,
      negativeApplied: wrong ? neg : 0,
      needsManualGrading: false,
    };
  }

  return {
    isCorrect: false,
    marksAwarded: 0,
    negativeApplied: 0,
    needsManualGrading: false,
  };
}

export function finalizeAttemptScores(attempt) {
  let obtained = 0;
  let negative = 0;
  let pendingManual = false;
  let autoDone = true;

  for (const ans of attempt.answers || []) {
    if (ans.needsManualGrading && (ans.marksAwarded === null || ans.marksAwarded === undefined)) {
      pendingManual = true;
      autoDone = false;
      continue;
    }
    obtained += Number(ans.marksAwarded) || 0;
    negative += Number(ans.negativeApplied) || 0;
  }

  obtained = Math.max(0, obtained - negative);
  const total = Number(attempt.totalMarks) || 0;
  const percentage =
    total > 0 ? Number(((obtained / total) * 100).toFixed(2)) : 0;
  const passed = percentage >= Number(attempt.passingPercentage || 0);

  return {
    obtainedMarks: Number(obtained.toFixed(2)),
    negativeMarks: Number(negative.toFixed(2)),
    percentage,
    passed,
    evaluationStatus: pendingManual ? (autoDone ? 'partial' : 'partial') : 'completed',
    pendingManual,
  };
}
