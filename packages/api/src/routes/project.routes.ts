import { Router } from 'express';
import { createProjectSchema, updateProjectSchema } from '@devpulse/shared';
import { asyncHandler } from '../lib/async-handler.js';
import { forbidden } from '../lib/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as projects from '../services/project.service.js';
import { countEvents, listEventNames, listPropertyKeys } from '../services/event.service.js';

export const projectRoutes = Router();

projectRoutes.use(requireAuth);

/** GET /projects — owners and admins see every project, viewers only their own. */
projectRoutes.get('/', (req, res) => {
  const user = req.user!;
  const scope = user.role === 'viewer' ? user.id : undefined;
  res.json({ data: projects.listProjects(scope) });
});

/** POST /projects */
projectRoutes.post(
  '/',
  requireRole('admin'),
  validateBody(createProjectSchema),
  asyncHandler(async (req, res) => {
    const created = projects.createProject(req.user!.id, req.body as { name: string });
    // The plaintext key appears in this response only; it is stored hashed.
    res.status(201).json({ project: created.project, writeKey: created.writeKey });
  }),
);

/** GET /projects/:idOrSlug */
projectRoutes.get('/:idOrSlug', (req, res) => {
  const project = projects.requireProject(req.params.idOrSlug!);
  assertCanRead(req.user!, project.ownerId);
  res.json({ project, stats: { events: countEvents(project.id) } });
});

/** PATCH /projects/:id */
projectRoutes.patch(
  '/:id',
  requireRole('admin'),
  validateBody(updateProjectSchema),
  asyncHandler(async (req, res) => {
    const project = projects.requireProject(req.params.id!);
    res.json({ project: projects.updateProject(project.id, req.body) });
  }),
);

/** DELETE /projects/:id — removes every event belonging to the project. */
projectRoutes.delete('/:id', requireRole('owner'), (req, res) => {
  projects.deleteProject(req.params.id!);
  res.status(204).end();
});

/** POST /projects/:id/rotate-key — revokes all live keys and returns a new one. */
projectRoutes.post('/:id/rotate-key', requireRole('admin'), (req, res) => {
  const project = projects.requireProject(req.params.id!);
  res.json({ writeKey: projects.rotateWriteKey(project.id) });
});

/** GET /projects/:id/schema — the event names and property keys actually in use. */
projectRoutes.get('/:id/schema', (req, res) => {
  const project = projects.requireProject(req.params.id!);
  assertCanRead(req.user!, project.ownerId);
  res.json({
    eventNames: listEventNames(project.id),
    propertyKeys: listPropertyKeys(project.id),
  });
});

function assertCanRead(user: { id: string; role: string }, ownerId: string): void {
  if (user.role === 'viewer' && user.id !== ownerId) {
    throw forbidden('You do not have access to this project');
  }
}
