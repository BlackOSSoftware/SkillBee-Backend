import * as curriculumService from '../services/curriculum.service.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export const listTopics = asyncHandler(async (req, res) => {
  const result = await curriculumService.listTopics(
    req,
    req.params.courseId,
    req.query
  );
  res.json({
    success: true,
    data: { topics: result.topics },
    pagination: result.pagination,
  });
});

export const createTopic = asyncHandler(async (req, res) => {
  const topic = await curriculumService.createTopic(req, req.params.courseId, req.body);
  res.status(201).json({
    success: true,
    message: 'Topic created successfully',
    data: { topic },
  });
});

export const getTopic = asyncHandler(async (req, res) => {
  const topic = await curriculumService.getTopicById(req, req.params.id);
  res.json({ success: true, data: { topic } });
});

export const updateTopic = asyncHandler(async (req, res) => {
  const topicId = req.params.id || req.params.topicId;
  const topic = await curriculumService.updateTopic(
    req,
    topicId,
    req.body,
    req.params.courseId
  );
  res.json({
    success: true,
    message: 'Topic updated successfully',
    data: { topic },
  });
});

export const deleteTopic = asyncHandler(async (req, res) => {
  const topicId = req.params.id || req.params.topicId;
  const topic = await curriculumService.deleteTopic(req, topicId, req.params.courseId);
  res.json({
    success: true,
    message: 'Topic archived successfully',
    data: { topic },
  });
});

export const reorderTopics = asyncHandler(async (req, res) => {
  const topics = await curriculumService.reorderTopics(req, req.params.courseId, req.body);
  res.json({ success: true, message: 'Topics reordered successfully', data: { topics } });
});

export const duplicateTopic = asyncHandler(async (req, res) => {
  const topic = await curriculumService.duplicateTopic(req, req.params.id);
  res.status(201).json({
    success: true,
    message: 'Topic duplicated successfully',
    data: { topic },
  });
});

export const changeTopicStatus = asyncHandler(async (req, res) => {
  const topic = await curriculumService.changeTopicStatus(
    req,
    req.params.id,
    req.body.status
  );
  res.json({ success: true, message: 'Topic status updated', data: { topic } });
});
