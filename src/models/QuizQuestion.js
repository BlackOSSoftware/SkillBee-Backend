import mongoose from 'mongoose';
import { QUESTION_TYPES } from '../config/security.js';

const optionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, trim: true },
    image: { type: String, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const blankSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    acceptedAnswers: { type: [String], default: [] },
    caseSensitive: { type: Boolean, default: false },
    marks: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const rubricSchema = new mongoose.Schema(
  {
    criterion: { type: String, required: true },
    maximumMarks: { type: Number, min: 0, required: true },
    description: { type: String, default: '' },
  },
  { _id: false }
);

const quizQuestionSchema = new mongoose.Schema(
  {
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
      index: true,
    },
    questionBankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionBank',
      default: null,
    },
    questionText: { type: String, required: true, trim: true, maxlength: 5000 },
    questionType: { type: String, enum: QUESTION_TYPES, required: true },
    description: { type: String, default: '', maxlength: 5000 },
    marks: { type: Number, min: 0, required: true },
    negativeMarks: { type: Number, min: 0, default: 0 },
    sortOrder: { type: Number, min: 0, default: 0 },
    isRequired: { type: Boolean, default: true },
    explanation: { type: String, default: '', maxlength: 5000 },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    tags: { type: [String], default: [] },
    options: { type: [optionSchema], default: [] },
    correctOptionIds: { type: [String], default: [] },
    correctAnswer: { type: Boolean, default: null },
    acceptedAnswers: { type: [String], default: [] },
    answerMatchingMode: {
      type: String,
      enum: ['exact', 'case_insensitive', 'normalized'],
      default: 'case_insensitive',
    },
    gradingMode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    gradingRubric: { type: [rubricSchema], default: [] },
    blanks: { type: [blankSchema], default: [] },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

quizQuestionSchema.index({ quizId: 1, sortOrder: 1, deletedAt: 1 });

export const QuizQuestion = mongoose.model('QuizQuestion', quizQuestionSchema);
