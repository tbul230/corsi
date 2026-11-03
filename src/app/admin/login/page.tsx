import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Container } from '@/components/ui';
import { getAdmin } from '@/lib/supabase/server';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Researcher login', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  const { isAdmin } = await getAdmin();
  if (isAdmin) redirect('/admin');
  return (
    <Container className="max-w-md! pt-16">
      <LoginForm />
    </Container>
  );
}
