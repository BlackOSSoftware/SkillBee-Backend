import mongoose from 'mongoose';
import { QUIZ_SHOW_RESULTS, QUIZ_STATUS } from '../config/security.js';

const availabilitySchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    timezone: { type: String, default: 'UTC' },
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    instructions: { type: String, trim: true, maxlength: 10000, default: '' },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseTopic', default: null },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseLesson',
      default: null,
      index: true,
    },
    timeLimitSeconds: { type: Number, min: 0, default: 0 },
    totalMarks: { type: Number, min: 0, default: 0 },
    passingPercentage: { type: Number, min: 0, max: 100, default: 50 },
    // null = unlimited attempts
    maximumAttempts: { type: Number, min: 0, default: 1 },
    randomizeQuestions: { type: Boolean, default: false },
    randomizeAnswers: { type: Boolean, default: false },
    showResults: {
      type: String,
      enum: QUIZ_SHOW_RESULTS,
      default: 'after_submission',
    },
    showCorrectAnswers: { type: Boolean, default: false },
    showExplanation: { type: Boolean, default: false },
    negativeMarkingEnabled: { type: Boolean, default: false },
    negativeMarksPerWrongAnswer: { type: Number, min: 0, default: 0 },
    allowResume: { type: Boolean, default: true },
    allowBackNavigation: { type: Boolean, default: true },
    requireAllQuestions: { type: Boolean, default: false },
    allowPartialCreditMultiSelect: { type: Boolean, default: false },
    questionSelectionMode: {
      type: String,
      enum: ['all', 'random_count'],
      default: 'all',
    },
    questionsToSelect: { type: Number, min: 1, default: null },
    tags: { type: [String], default: [] },
    availability: { type: availabilitySchema, default: () => ({}) },
    status: {
      type: String,
      enum: Object.values(QUIZ_STATUS),
      default: QUIZ_STATUS.DRAFT,
      index: true,
    },
    publishedAt: { type: Date, default: null },
    version: { type: Number, min: 1, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null, index: true },
    sourceQuizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', default: null },
    isDemoSeed: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

quizSchema.index({ courseId: 1, slug: 1 }, { unique: true });
quizSchema.index({ 'availability.startsAt': 1, 'availability.endsAt': 1 });
quizSchema.index({ status: 1, deletedAt: 1, createdAt: -1 });

quizSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    title: this.title,
    slug: this.slug,
    description: this.description,
    instructions: this.instructions,
    courseId: this.courseId.toString(),
    topicId: this.topicId?.toString?.() || null,
    lessonId: this.lessonId?.toString?.() || null,
    timeLimitSeconds: this.timeLimitSeconds,
    totalMarks: this.totalMarks,
    passingPercentage: this.passingPercentage,
    maximumAttempts: this.maximumAttempts,
    unlimitedAttempts: !this.maximumAttempts,
    randomizeQuestions: this.randomizeQuestions,
    randomizeAnswers: this.randomizeAnswers,
    showResults: this.showResults,
    showCorrectAnswers: this.showCorrectAnswers,
    showExplanation: this.showExplanation,
    negativeMarkingEnabled: this.negativeMarkingEnabled,
    negativeMarksPerWrongAnswer: this.negativeMarksPerWrongAnswer,
    allowResume: this.allowResume,
    allowBackNavigation: this.allowBackNavigation,
    requireAllQuestions: this.requireAllQuestions,
    allowPartialCreditMultiSelect: this.allowPartialCreditMultiSelect,
    questionSelectionMode: this.questionSelectionMode,
    questionsToSelect: this.questionsToSelect,
    tags: this.tags,
    availability: this.availability,
    status: this.status,
    publishedAt: this.publishedAt,
    version: this.version,
    createdBy: this.createdBy?.toString?.() || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    deletedAt: this.deletedAt,
    isDemoSeed: this.isDemoSeed,
  };
};

export const Quiz = mongoose.model('Quiz', quizSchema);
