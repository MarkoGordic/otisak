import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const user = await getUserFromSession(request);

  if (!user) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar_url: user.avatar_url,
      index_number: user.index_number,
    },
  });
}
