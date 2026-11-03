export default function TestModeBanner({ className = '' }: { className?: string }) {
  return (
    <div
      data-testid="test-mode-banner"
      className={`rounded-lg border border-amber-300/40 bg-amber-300/10 px-4 py-2.5 text-sm text-amber-100 ${className}`}>
      <strong>Admin test mode</strong> — breaks can be skipped and conditions redone. These results are not counted.
    </div>
  );
}
