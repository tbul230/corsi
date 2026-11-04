import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Container } from '@/components/ui';
import { ExperimentError, getSessionDetail } from '@/lib/server/experiment';
import { getSessionUser } from '@/lib/server/session';
import type { SessionDetail } from '@/lib/types';
import SessionRunner from './SessionRunner';

export const metadata: Metadata = { title: 'Experiment session' };
export const dynamic = 'force-dynamic';

const SID = /^[A-Za-z0-9_-]{1,160}__(video_game|youtube|no_screen)$/;

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SID.test(id)) notFound();
  const user = await getSessionUser();
  if (!user) redirect('/register');
  if (!id.startsWith(`${user.pid}__`)) notFound();
  let detail: SessionDetail;
  try {
    detail = (await getSessionDetail(user.pid, id)) as SessionDetail;
  } catch (e) {
    if (e instanceof ExperimentError && e.code === 'SESSION_NOT_FOUND') notFound();
    throw e;
  }
  return (
    <Container className="py-6 sm:py-10 lg:py-12">
      <SessionRunner initial={detail} />
    </Container>
  );
}
