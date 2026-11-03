import mongoose from 'mongoose';

const courseFaqSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    question: { type: String, required: true, trim: true, maxlength: 300 },
    answer: { type: String, required: true, trim: true, maxlength: 2000 },
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

courseFaqSchema.index({ courseId: 1, sortOrder: 1 });

courseFaqSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    courseId: this.courseId.toString(),
    question: this.question,
    answer: this.answer,
    sortOrder: this.sortOrder,
    status: this.status,
  };
};

export const CourseFAQ = mongoose.model('CourseFAQ', courseFaqSchema);
