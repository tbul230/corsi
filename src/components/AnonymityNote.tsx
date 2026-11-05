/** Short, friendly anonymity statement shown on the landing page, at sign-up and before each break. */
export default function AnonymityNote({ prominent = false, className = '' }: { prominent?: boolean; className?: string }) {
  return (
    <div
      data-testid="anonymity-note"
      className={`rounded-xl border px-4 py-3 text-sm ${prominent ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-50' : 'border-white/10 bg-white/5 text-ink-2'} ${className}`}>
      <strong className="text-ink">Your responses are anonymous.</strong> Google sign-in is only used to save your
      progress. Teachers and researchers see a random code (like P-7F3K) and your results — never who you are.
    </div>
  );
}
