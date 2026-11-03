import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, Container } from '@/components/ui';
import { getAdmin } from '@/lib/supabase/server';
import { loadAdminData } from '@/lib/admin-data';
import AdminDashboard from './AdminDashboard';
import SignOutButton from './SignOutButton';

export const metadata: Metadata = { title: 'Administrator dashboard', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const { supabase, user, isAdmin } = await getAdmin();
  if (!user) redirect('/admin/login');
  if (!isAdmin) {
    return (
      <Container className="flex flex-1 items-center justify-center py-12">
      <div className="w-full max-w-md">
        <Card className="text-center">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="mt-2 text-sm muted">
            {user.email} is signed in but is not an administrator of this experiment.
          </p>
          <div className="mt-6"><SignOutButton /></div>
        </Card>
        </div>
    </Container>
    );
  }
  const data = await loadAdminData(supabase);
  return (
    <Container className="pt-8">
      <AdminDashboard data={data} email={user.email ?? ''} />
    </Container>
  );
}
