import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, Container, Eyebrow } from '@/components/ui';
import { LockIcon } from '@/components/icons';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { getSessionUser } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Researcher login', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  const user = await getSessionUser();
  if (user?.isAdmin) redirect('/admin');
  return (
    <Container className="flex flex-1 items-center justify-center py-12">
      <div className="w-full max-w-md">
        <Card className="fade-up">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent/12 text-accent">
            <LockIcon className="h-6 w-6" />
          </div>
          <div className="mt-4">
            <Eyebrow>Administrators only</Eyebrow>
            <h1 className="mt-1 text-2xl font-semibold">Researcher login</h1>
            <p className="mt-2 text-sm text-ink-2">
              Sign in with your Google account. Approved researcher accounts are recognised automatically — no password
              needed.
            </p>
          </div>
          <div className="mt-6">
            <GoogleSignInButton label="Sign in with Google" adminTarget="/admin" />
          </div>
          {user && !user.isAdmin ? (
            <p className="mt-4 text-sm text-amber-200">
              {user.email} is signed in but is not an administrator of this experiment.
            </p>
          ) : null}
        </Card>
      </div>
    </Container>
  );
}
