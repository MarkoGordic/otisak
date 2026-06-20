import { Request, Response } from 'express';
import { getOtisakExamById } from '../db/otisak';
import { canUserManageExam } from '../db/auth-helpers';

// Helper function to get examId from params
export function getExamId(req: Request): string {
  return req.params.examId;
}

// Gate any mutation route that admins+assistants share: admins are always
// allowed; assistants must be assigned to the exam's subject. Sends the
// response on rejection and returns false so the caller can early-exit.
export async function assertCanManageExam(req: Request, res: Response, examId: string): Promise<boolean> {
  const user = req.user!;
  if (user.role === 'admin') return true;
  const allowed = await canUserManageExam(user.id, examId, false);
  if (!allowed) {
    res.status(403).json({ error: 'Not authorized to manage this exam' });
    return false;
  }
  return true;
}

// Tiny in-memory cache for high-frequency polling endpoints. 1s TTL keeps the load
// off the DB when many students poll /room-status and /lockdown every 2-3s.
export const examCache = new Map<string, { exam: Awaited<ReturnType<typeof getOtisakExamById>>; expiresAt: number }>();
export async function getCachedExam(examId: string) {
  const now = Date.now();
  const hit = examCache.get(examId);
  if (hit && hit.expiresAt > now) return hit.exam;
  const exam = await getOtisakExamById(examId);
  examCache.set(examId, { exam, expiresAt: now + 1000 });
  return exam;
}
export function invalidateExamCache(examId: string) { examCache.delete(examId); }
