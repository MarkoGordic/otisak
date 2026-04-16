import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireAuth, requireRole } from '@/lib/api-auth';
import { getOtisakSubjects, createOtisakSubject, updateOtisakSubject, deleteOtisakSubject } from '@/lib/db/otisak';

export async function GET(request: NextRequest) {
  const user = await getUserFromSession(request);
  const authErr = requireAuth(user);
  if (authErr) return authErr;

  const subjects = await getOtisakSubjects();
  return NextResponse.json({ subjects });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const data = await request.json();
  if (!data.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const subject = await createOtisakSubject(data, user!.id);
  return NextResponse.json({ subject }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const data = await request.json();
  if (!data.id) return NextResponse.json({ error: 'Subject ID required' }, { status: 400 });

  const subject = await updateOtisakSubject(data.id, data);
  return NextResponse.json({ subject });
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin']);
  if (roleErr) return roleErr;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  await deleteOtisakSubject(id);
  return NextResponse.json({ ok: true });
}
