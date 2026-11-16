import Link from 'next/link';
import { Card, Container } from '@/components/ui';

export default function NotFound() {
  return (
    <Container className="flex flex-1 items-center justify-center py-12 text-center">
      <div className="w-full max-w-md">
      <Card>
        <p className="text-5xl font-semibold">404</p>
        <p className="mt-2 muted">This page does not exist.</p>
        <Link href="/" className="btn btn-primary mt-6">Back to start</Link>
      </Card>
      </div>
    </Container>
  );
}
