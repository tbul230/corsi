'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { loadRecaptcha, RECAPTCHA_SITE_KEY, recaptchaEnabled, type Grecaptcha } from '@/lib/recaptcha';

export type RecaptchaHandle = { reset: () => void };

/** The "I'm not a robot" checkbox. Calls onToken with a token once solved, and with '' when it expires. */
const RecaptchaBox = forwardRef<RecaptchaHandle, { onToken: (token: string) => void }>(function RecaptchaBox({ onToken }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const widget = useRef<{ g: Grecaptcha; id: number } | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      widget.current?.g.reset(widget.current.id);
      cb.current('');
    }
  }));

  useEffect(() => {
    if (!recaptchaEnabled) return;
    let cancelled = false;
    loadRecaptcha()
      .then((g) => {
        if (cancelled || !el.current || widget.current) return;
        const id = g.render(el.current, {
          sitekey: RECAPTCHA_SITE_KEY,
          theme: 'dark',
          callback: (t: string) => cb.current(t),
          'expired-callback': () => cb.current(''),
          'error-callback': () => cb.current('')
        });
        widget.current = { g, id };
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!recaptchaEnabled) return null;
  return (
    <div>
      <div ref={el} className="min-h-[78px]" data-testid="recaptcha" />
      {error ? <p className="mt-1 text-xs text-red-200">{error}</p> : null}
    </div>
  );
});

export default RecaptchaBox;
