import type { Metadata } from 'next';
import { Container } from '@/components/ui';
import TestModeForm from './TestModeForm';

export const metadata: Metadata = { title: 'Admin test mode', robots: { index: false } };

export default function TestModePage() {
  return (
    <Container className="max-w-md! pt-16">
      <TestModeForm />
    </Container>
  );
}
