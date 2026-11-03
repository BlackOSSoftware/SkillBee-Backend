import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeStatsFromRatings } from '../src/modules/courses/services/ratingStats.service.js';

describe('Review rating stats unit tests', () => {
  it('computes average and distribution from approved ratings only', () => {
    const stats = computeStatsFromRatings([5, 4, 5, 3]);
    assert.equal(stats.approvedReviewCount, 4);
    assert.equal(stats.averageRating, 4.25);
    assert.equal(stats.distribution[5], 2);
    assert.equal(stats.distribution[4], 1);
    assert.equal(stats.distribution[3], 1);
    assert.equal(stats.distribution[1], 0);
  });

  it('ignores invalid ratings', () => {
    const stats = computeStatsFromRatings([5, 0, 6, 3.5, 2]);
    assert.equal(stats.approvedReviewCount, 2);
    assert.equal(stats.averageRating, 3.5);
  });

  it('returns zeros for empty set', () => {
    const stats = computeStatsFromRatings([]);
    assert.equal(stats.averageRating, 0);
    assert.equal(stats.totalApprovedReviews, 0);
  });
});
