// Aggregator for the per-exam router mounted at /api/otisak/exams/:examId.
// The handlers live in three sub-routers (split by concern) plus a shared
// helpers module (exam-shared.ts) that holds getExamId, assertCanManageExam,
// and the single shared 1s examCache. Mounting multiple sub-routers with
// router.use(subRouter) at the same base is fine because no two handlers share
// the same method+path. Each sub-router is Router({ mergeParams: true }) so it
// can read req.params.examId.
import { Router } from 'express';
import attemptRoutes from './exam-attempt';
import managementRoutes from './exam-management';
import roomRoutes from './exam-room';

const router = Router({ mergeParams: true });
router.use(attemptRoutes);
router.use(managementRoutes);
router.use(roomRoutes);
export default router;
