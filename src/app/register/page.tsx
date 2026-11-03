import type { Metadata } from 'next';
import { Container } from '@/components/ui';
import RegisterFlow from './RegisterFlow';

export const metadata: Metadata = { title: 'Register' };

export default function RegisterPage() {
  return (
    <Container className="max-w-2xl! pt-10">
      <RegisterFlow />
    </Container>
  );
}
