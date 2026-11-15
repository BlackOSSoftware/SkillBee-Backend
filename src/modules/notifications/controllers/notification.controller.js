import * as deviceService from '../services/device.service.js';
import * as notificationService from '../services/notification.service.js';

export async function registerDevice(req, res, next) {
  try {
    const data = await deviceService.registerDevice(req, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listDevices(req, res, next) {
  try {
    const data = await deviceService.listMyDevices(req);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function removeDevice(req, res, next) {
  try {
    const data = await deviceService.removeDevice(req, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listMyNotifications(req, res, next) {
  try {
    const result = await notificationService.listStudentNotifications(req, req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function listAdminNotifications(req, res, next) {
  try {
    const result = await notificationService.listAdminNotifications(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function listCampaigns(req, res, next) {
  try {
    const result = await notificationService.listCampaigns(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getCampaign(req, res, next) {
  try {
    const data = await notificationService.getCampaign(req.params.campaignId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createAdminNotification(req, res, next) {
  try {
    const data = await notificationService.createAdminNotification(req, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const data = await notificationService.markRead(req, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req, res, next) {
  try {
    const data = await notificationService.markAllRead(req);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteNotification(req, res, next) {
  try {
    const data = await notificationService.deleteOwnNotification(req, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
