import { redirect } from 'next/navigation';

/** Test mode is now started from the admin dashboard after Google sign-in. */
export default function TestModePage() {
  redirect('/admin');
}
