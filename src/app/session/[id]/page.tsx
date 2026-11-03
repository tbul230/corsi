import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Container } from '@/components/ui';
import { callRpc, getParticipantToken, RpcError } from '@/lib/participant-server';
import type { SessionDetail } from '@/lib/types';
import SessionRunner from './SessionRunner';

export const metadata: Metadata = { title: 'Experiment session' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const token = await getParticipantToken();
  if (!token) redirect('/register');
  let detail: SessionDetail;
  try {
    detail = await callRpc<SessionDetail>('get_session', { p_token: token, p_session: id });
  } catch (e) {
    if (e instanceof RpcError && e.code === 'NOT_AUTHENTICATED') redirect('/register');
    if (e instanceof RpcError && e.code === 'SESSION_NOT_FOUND') notFound();
    throw e;
  }
  return (
    <Container className="py-6 sm:py-10 lg:py-12">
      <SessionRunner initial={detail} />
    </Container>
  );
}
