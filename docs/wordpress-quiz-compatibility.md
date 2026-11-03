# WordPress / Tutor LMS Quiz Compatibility Findings

**Date:** 2026-11-02  
**Inspection mode:** Read-only (no WordPress admin changes)  
**Scope:** SkillBee legacy site uses Tutor LMS / Tutor LMS Pro (from prior Phase audits)

## Verified existing behavior

From earlier read-only audits of the live WordPress site (not re-queried from this repository):

- Tutor LMS quiz items appear in course curricula.
- Quiz attempt history and scored results are visible in Tutor reporting.
- Students can complete quizzes and see some form of scored outcome.

These points remain **high-level** observations from prior audits.

## Not verified (this Phase 5 workspace)

This repository does **not** contain WordPress PHP, Tutor LMS database dumps, or live WP-admin access for Phase 5.

Therefore the following were **not conclusively verified** against the production Tutor LMS configuration:

- Exact supported question type enum (MCQ, multi-answer, true/false, short answer, essay, fill blanks, matching, ordering, etc.)
- Default timer / time-limit behavior and grace periods
- Maximum attempts defaults and “unlimited” semantics
- Question and answer randomization switches
- Result visibility modes (immediate vs delayed vs after grading)
- Negative marking configuration and whether unanswered questions are penalized
- Manual grading support for essay/long answers
- Exact scoring fields stored on attempt records
- Partial credit rules for multi-select

## Proposed new SkillBee functionality

The SkillBee native quiz module implements the architecture in the Phase 5 specification:

| Feature | SkillBee Phase 5 |
|---------|------------------|
| Question types | `multiple_choice`, `multiple_select`, `true_false`, `short_answer`, `long_answer`, `fill_in_the_blanks` |
| Server-side timer | `startedAt` / immutable `expiresAt` |
| Negative marking | Configurable; unanswered not penalized by default; score floor 0 |
| Snapshots | Immutable attempt question snapshots |
| Privacy | Student serializers strip answer keys |
| Manual grading | Long-answer pending → instructor grade |
| Randomization | Question order + option order + random count selection |

These are **new platform features**, not claimed 1:1 Tutor LMS clones.

## Migration mapping requirements (future)

| Tutor concept (expected) | SkillBee target |
|--------------------------|-----------------|
| Quiz post / quiz settings | `Quiz` |
| Quiz questions | `QuizQuestion` (+ optional `QuestionBank`) |
| Attempt / answers | `QuizAttempt` with snapshots |
| Manual essay grade | `QuizAttempt` answer `marksAwarded` + grader audit |
| Curriculum quiz item | Link via `courseId` / `lessonId` |

Do **not** auto-import production Tutor attempts until a dedicated migration tool validates field mapping against a verified WordPress dump.

## Uncertainty statement

Where Tutor LMS behavior could not be inspected in this session, SkillBee uses the Phase 5 proposed design as the source of truth for the new backend.
