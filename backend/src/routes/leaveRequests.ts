import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import {
  cancelLeaveRequest,
  canApproveLeave,
  createLeaveRequest,
  decideLeaveRequest,
  LEAVE_TYPES,
  listLeaveRequests,
} from '../lib/leaveRequests.js';
import { LeaveRequestStatus } from '../types.js';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  requirePermission('view:daily-updates', 'submit:daily-update', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    return res.json({
      requests: listLeaveRequests(req.user!, { userId, status, from, to }),
      leaveTypes: LEAVE_TYPES,
    });
  }
);

router.post(
  '/',
  requirePermission('view:daily-updates', 'submit:daily-update'),
  (req: AuthedRequest, res) => {
    const result = createLeaveRequest(req.user!, req.body || {});
    if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
    return res.status(201).json({ request: result.request, message: 'Request submitted.' });
  }
);

router.post(
  '/:id/decide',
  requirePermission('view:daily-updates', 'submit:daily-update', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const status = String(req.body?.status || '').toUpperCase() as LeaveRequestStatus;
    const result = decideLeaveRequest(req.user!, String(req.params.id), status, String(req.body?.comment || ''));
    if ('error' in result) {
      return res.status(result.status || 400).json({
        message:
          result.error === 'not_found'
            ? 'Request not found.'
            : result.error,
      });
    }
    return res.json({ request: result.request, message: `Request ${status.toLowerCase()}.` });
  }
);

router.post(
  '/:id/cancel',
  requirePermission('view:daily-updates', 'submit:daily-update'),
  (req: AuthedRequest, res) => {
    const result = cancelLeaveRequest(req.user!, String(req.params.id));
    if ('error' in result) {
      return res.status(result.status || 400).json({
        message: result.error === 'not_found' ? 'Request not found.' : result.error,
      });
    }
    return res.json({ request: result.request, message: 'Request cancelled.' });
  }
);

router.get(
  '/can-approve/:id',
  requirePermission('view:daily-updates', 'submit:daily-update', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const request = listLeaveRequests(req.user!).find((item) => item.id === req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found.' });
    return res.json({ canApprove: canApproveLeave(req.user!, request) });
  }
);

export default router;
