import mongoose from 'mongoose';
import { ATTEMPT_STATUS } from '../config/security.js';

const optionSnapshotSchema = new mongoose.Schema(
  {
    id: String,
    text: String,
    image: String,
    sortOrder: Number,
  },
  { _id: false }
);

const blankSnapshotSchema = new mongoose.Schema(
  {
    id: String,
    acceptedAnswers: [String],
    caseSensitive: Boolean,
    marks: Number,
  },
  { _id: false }
);

const questionSnapshotSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    questionText: String,
    questionType: String,
    description: String,
    marks: Number,
    negativeMarks: Number,
    isRequired: Boolean,
    explanation: String,
    options: [optionSnapshotSchema],
    // answer keys stored only for server evaluation — never sent to students mid-attempt
    correctOptionIds: [String],
    correctAnswer: Boolean,
    acceptedAnswers: [String],
    answerMatchingMode: String,
    gradingMode: String,
    gradingRubric: [mongoose.Schema.Types.Mixed],
    blanks: [blankSnapshotSchema],
    sortOrder: Number,
  },
  { _id: false }
);

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    selectedOptionIds: { type: [String], default: undefined },
    booleanAnswer: { type: Boolean, default: undefined },
    text: { type: String, default: undefined },
    blankAnswers: {
      type: [
        {
          blankId: String,
          value: String,
        },
      ],
      default: undefined,
    },
    isCorrect: { type: Boolean, default: null },
    marksAwarded: { type: Number, default: null },
    negativeApplied: { type: Number, default: 0 },
    needsManualGrading: { type: Boolean, default: false },
    feedback: { type: String, default: '' },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    gradedAt: { type: Date, default: null },
  },
  { _id: false }
);

const quizAttemptSchema = new mongoose.Schema(
  {
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    attemptNumber: { type: Number, min: 1, required: true },
    quizVersion: { type: Number, required: true },
    quizTitle: { type: String, required: true },
    passingPercentage: { type: Number, required: true },
    negativeMarkingEnabled: { type: Boolean, default: false },
    negativeMarksPerWrongAnswer: { type: Number, default: 0 },
    allowPartialCreditMultiSelect: { type: Boolean, default: false },
    showResults: { type: String, required: true },
    showCorrectAnswers: { type: Boolean, default: false },
    showExplanation: { type: Boolean, default: false },
    questionSnapshots: { type: [questionSnapshotSchema], default: [] },
    selectedQuestionIds: [{ type: mongoose.Schema.Types.ObjectId }],
    answers: { type: [answerSchema], default: [] },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    autoSubmittedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ATTEMPT_STATUS,
      default: 'in_progress',
      index: true,
    },
    totalMarks: { type: Number, min: 0, default: 0 },
    obtainedMarks: { type: Number, default: 0 },
    negativeMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: null },
    passed: { type: Boolean, default: null },
    resultPublishedAt: { type: Date, default: null },
    timeTakenSeconds: { type: Number, default: null },
    evaluationStatus: {
      type: String,
      enum: ['pending', 'partial', 'completed'],
      default: 'pending',
    },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    gradedAt: { type: Date, default: null },
    gradingAudit: {
      type: [
        {
          at: Date,
          by: mongoose.Schema.Types.ObjectId,
          note: String,
        },
      ],
      default: [],
    },
  },
  { timestamps: true, versionKey: false }
);

quizAttemptSchema.index({ quizId: 1, studentId: 1, attemptNumber: 1 }, { unique: true });
quizAttemptSchema.index({ studentId: 1, status: 1, createdAt: -1 });
quizAttemptSchema.index({ courseId: 1, status: 1 });

export const QuizAttempt = mongoose.model('QuizAttempt', quizAttemptSchema);
