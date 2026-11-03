import type { Metadata } from 'next';
import { Container } from '@/components/ui';
import TestModeForm from './TestModeForm';

export const metadata: Metadata = { title: 'Admin test mode', robots: { index: false } };

export default function TestModePage() {
  return (
    <Container className="flex flex-1 items-center justify-center py-12">
      <div className="w-full max-w-md">
      <TestModeForm />
      </div>
    </Container>
  );
}
