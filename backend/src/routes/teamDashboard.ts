import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requireTeamDashboardAccess } from '../lib/rbac.js';
import { buildTeamDashboard } from '../lib/teamDashboard.js';

const router = Router();

router.get('/', requireAuth, requireTeamDashboardAccess, (req: AuthedRequest, res) => {
  const query = {
    year: typeof req.query.year === 'string' ? req.query.year : undefined,
    month: typeof req.query.month === 'string' ? req.query.month : undefined,
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
    userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
    role: typeof req.query.role === 'string' ? req.query.role : undefined,
    teamId: typeof req.query.teamId === 'string' ? req.query.teamId : undefined,
    projectId: typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
  };
  return res.json(buildTeamDashboard(query));
});

export default router;
