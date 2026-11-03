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

const questionBankSchema = new mongoose.Schema(
  {
    questionText: { type: String, required: true, trim: true, maxlength: 5000 },
    questionType: { type: String, enum: QUESTION_TYPES, required: true, index: true },
    description: { type: String, default: '', maxlength: 5000 },
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
    explanation: { type: String, default: '', maxlength: 5000 },
    defaultMarks: { type: Number, min: 0, default: 1 },
    negativeMarks: { type: Number, min: 0, default: 0 },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
      index: true,
    },
    tags: { type: [String], default: [] },
    category: { type: String, trim: true, default: 'general', index: true },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
    isDemoSeed: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

questionBankSchema.index({ questionText: 'text' });
questionBankSchema.index({ tags: 1 });
questionBankSchema.index({ category: 1, difficulty: 1, questionType: 1 });

questionBankSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    questionText: this.questionText,
    questionType: this.questionType,
    description: this.description,
    options: this.options,
    correctOptionIds: this.correctOptionIds,
    correctAnswer: this.correctAnswer,
    acceptedAnswers: this.acceptedAnswers,
    answerMatchingMode: this.answerMatchingMode,
    gradingMode: this.gradingMode,
    gradingRubric: this.gradingRubric,
    blanks: this.blanks,
    explanation: this.explanation,
    defaultMarks: this.defaultMarks,
    negativeMarks: this.negativeMarks,
    difficulty: this.difficulty,
    tags: this.tags,
    category: this.category,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const QuestionBank = mongoose.model('QuestionBank', questionBankSchema);
