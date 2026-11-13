'use client';

/** reCAPTCHA v2 checkbox ("I'm not a robot", with image challenges when Google asks for them). */
export const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '';
export const recaptchaEnabled = Boolean(RECAPTCHA_SITE_KEY);

export type Grecaptcha = {
  ready: (cb: () => void) => void;
  render: (el: HTMLElement, opts: Record<string, unknown>) => number;
  reset: (id?: number) => void;
};
declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
    __corsiRecaptchaLoaded?: () => void;
  }
}

let loading: Promise<Grecaptcha> | null = null;

export function loadRecaptcha(): Promise<Grecaptcha> {
  if (!loading) {
    loading = new Promise<Grecaptcha>((resolve, reject) => {
      if (window.grecaptcha?.render) return window.grecaptcha.ready(() => resolve(window.grecaptcha!));
      window.__corsiRecaptchaLoaded = () => resolve(window.grecaptcha!);
      const s = document.createElement('script');
      s.src = 'https://www.google.com/recaptcha/api.js?render=explicit&onload=__corsiRecaptchaLoaded';
      s.async = true;
      s.defer = true;
      s.onerror = () => {
        loading = null;
        reject(new Error('The robot check (reCAPTCHA) could not load. Check your internet connection, or ask IT to allow www.google.com/recaptcha.'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}
