import * as enquiryService from '../services/enquiry.service.js';
import * as ticketService from '../services/ticket.service.js';

// ---------- Public website enquiries ----------

export async function createEnquiry(req, res, next) {
  try {
    const data = await enquiryService.createEnquiry(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ---------- Admin: contact enquiries ----------

export async function listAdminEnquiries(req, res, next) {
  try {
    const result = await enquiryService.listAdminEnquiries(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getAdminEnquiry(req, res, next) {
  try {
    const data = await enquiryService.getAdminEnquiry(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateEnquiryStatus(req, res, next) {
  try {
    const data = await enquiryService.updateEnquiryStatus(req, req.params.id, req.body.status);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function addEnquiryReply(req, res, next) {
  try {
    const data = await enquiryService.addEnquiryReply(req, req.params.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function addEnquiryNote(req, res, next) {
  try {
    const data = await enquiryService.addEnquiryNote(req, req.params.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getEnquiryHistory(req, res, next) {
  try {
    const data = await enquiryService.getEnquiryHistory(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ---------- Student: support tickets ----------

export async function createTicket(req, res, next) {
  try {
    const data = await ticketService.createTicket(req, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listMyTickets(req, res, next) {
  try {
    const result = await ticketService.listMyTickets(req, req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getMyTicket(req, res, next) {
  try {
    const data = await ticketService.getMyTicket(req, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function replyMyTicket(req, res, next) {
  try {
    const data = await ticketService.replyMyTicket(req, req.params.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ---------- Admin: support tickets ----------

export async function listAdminTickets(req, res, next) {
  try {
    const result = await ticketService.listAdminTickets(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getAdminTicket(req, res, next) {
  try {
    const data = await ticketService.getAdminTicket(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function replyAdminTicket(req, res, next) {
  try {
    const data = await ticketService.replyAdminTicket(req, req.params.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function addTicketNote(req, res, next) {
  try {
    const data = await ticketService.addTicketNote(req, req.params.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateTicketStatus(req, res, next) {
  try {
    const data = await ticketService.updateTicketStatus(req, req.params.id, req.body.status);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function assignTicket(req, res, next) {
  try {
    const data = await ticketService.assignTicket(req, req.params.id, req.body.assignedTo);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getTicketHistory(req, res, next) {
  try {
    const data = await ticketService.getTicketHistory(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
