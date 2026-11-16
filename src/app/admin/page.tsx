import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, Container } from '@/components/ui';
import { getAdminData } from '@/lib/server/experiment';
import { getSessionUser } from '@/lib/server/session';
import AdminDashboard from './AdminDashboard';
import SignOutButton from './SignOutButton';

export const metadata: Metadata = { title: 'Administrator dashboard', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect('/admin/login');
  if (!user.isAdmin) {
    return (
      <Container className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-md">
          <Card className="text-center">
            <h1 className="text-xl font-semibold">Access denied</h1>
            <p className="mt-2 text-sm muted">{user.email} is signed in but is not an administrator of this experiment.</p>
            <div className="mt-6">
              <SignOutButton />
            </div>
          </Card>
        </div>
      </Container>
    );
  }
  const data = await getAdminData();
  return (
    <Container className="pt-8">
      <AdminDashboard data={data} email={user.email} />
    </Container>
  );
}
