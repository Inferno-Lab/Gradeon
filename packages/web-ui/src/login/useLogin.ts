import { useEffect, useRef, useState } from 'react';
import { rollDigits } from '../digits';

const EYE_ON = 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0';
const EYE_OFF = 'M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.4 7.6A16.5 16.5 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9.3 9.3 0 0 0 4.1-.9M9.9 9.9a3 3 0 0 0 4.2 4.2';
const LANGS = [['English', 'en'], ['हिन्दी', 'hi'], ['मराठी', 'mr']] as const;

/** The parts of a failed call the form reads. The API client's error has all of them. */
export interface LoginFailure {
  message: string;
  code?: string;
  fields?: Record<string, string>;
  attemptsLeft?: number;
}

/** Where the code went: shown on the code step so the person knows which phone or inbox to check. */
export interface Challenge { challengeId: string; demoCode?: string; channel?: 'sms' | 'email'; maskedTo?: string; expiresInSeconds?: number }

export interface LoginController {
  product: 'admin' | 'console';
  /** The school's own name for the panel and the heading. */
  schoolName: string;
  shortName: string;
  demoMode: boolean;
  /** Step one. Resolves to the code challenge, or to nothing when the school has two-step sign-in off. */
  submitCredentials: (email: string, password: string) => Promise<Challenge | null>;
  /** Step two. Resolves to the signed-in person's name. */
  submitCode: (challengeId: string, code: string) => Promise<string>;
  /** "Forgot it?": sends a code to the person's phone or email. Without it the link says who can help. */
  resetStart?: (identifier: string) => Promise<Challenge>;
  resetFinish?: (challengeId: string, code: string, password: string) => Promise<void>;
  /** Called when the person presses the button on the last step. */
  enter: () => void;
  goName: string;
  initialEmail?: string;
}

const failure = (e: unknown): LoginFailure => (e && typeof e === 'object' && 'message' in e ? (e as LoginFailure) : { message: 'Something went wrong. Try again.' });

/** Everything the sign-in page does: the two steps, the errors that shake, and the helpers for demo schools. */
export function useLogin(c: LoginController, themeCls: string) {
  const cons = c.product === 'console';
  const [step, setStep] = useState<'cred' | 'otp' | 'ok'>('cred');
  const [email, setEmail] = useState(c.initialEmail ?? '');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emErr, setEmErr] = useState('');
  const [pwErr, setPwErr] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [shake, setShake] = useState(0);
  const [tries, setTries] = useState(3);
  const [code, setCode] = useState('');
  const [otpErr, setOtpErr] = useState(false);
  const [otpMsg, setOtpMsg] = useState('');
  const [lang, setLang] = useState(() => {
    try { const i = LANGS.findIndex((l) => l[1] === localStorage.getItem('gradeon.lang')); return i < 0 ? 0 : i; } catch { return 0; }
  });
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [name, setName] = useState('');
  const [forgotNote, setForgotNote] = useState('');
  const [resetting, setResetting] = useState(false);
  const [newPw, setNewPw] = useState('');
  const fill = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => () => clearInterval(fill.current), []);
  const enterRef = useRef(c.enter);
  enterRef.current = c.enter;
  // The last step says "Opening…", so it does; the button stays for anyone who wants to skip the wait.
  useEffect(() => { if (step !== 'ok') return; const t = setTimeout(() => enterRef.current(), 1400); return () => clearTimeout(t); }, [step]);

  const bad = (fn: () => void) => { fn(); setShake((s) => (s === 1 ? 2 : 1)); setBusy(false); };

  const next = async () => {
    if (busy) return;
    if (!email.trim()) return bad(() => setEmErr(cons ? 'Enter your Gradeon email to continue.' : 'Enter your email or phone number to continue.'));
    if (!pw) return bad(() => { setPwErr(true); setPwMsg('Enter your password to continue.'); });
    setBusy(true);
    try {
      const res = await c.submitCredentials(email.trim(), pw);
      setBusy(false);
      if (res) { setChallenge(res); setCode(''); setOtpErr(false); setTries(3); setStep('otp'); }
      else { setName(email); setStep('ok'); }
    } catch (e) {
      const f = failure(e);
      bad(() => {
        if (f.fields?.identifier) setEmErr(f.fields.identifier);
        else { setPwErr(true); setPwMsg(f.attemptsLeft !== undefined && f.attemptsLeft <= 2 ? `${f.message} ${f.attemptsLeft} ${f.attemptsLeft === 1 ? 'try' : 'tries'} left.` : f.message); }
      });
    }
  };

  const forgot = async () => {
    if (!c.resetStart) { setForgotNote('Ask a super admin to set a new password for you in Team.'); return; }
    if (!email.trim()) return bad(() => setEmErr('Type your email or phone number first, then press “Forgot it?”.'));
    if (busy) return;
    setBusy(true);
    try {
      const ch = await c.resetStart(email.trim());
      setBusy(false); setChallenge(ch); setCode(''); setNewPw(''); setOtpErr(false); setTries(3); setResetting(true); setStep('otp');
    } catch (e) {
      bad(() => setEmErr(failure(e).message));
    }
  };

  const verifyNow = async (v: string) => {
    if (busy || !challenge) return;
    if (resetting) {
      if (v.length < 6 || newPw.length < 8) return bad(() => { setOtpErr(true); setOtpMsg(v.length < 6 ? 'Type the 6-digit code.' : 'Choose a password of at least 8 characters.'); });
      setBusy(true);
      try {
        await c.resetFinish!(challenge.challengeId, v, newPw);
        setBusy(false); setResetting(false); setPw(''); setStep('cred');
        setForgotNote('Your password is changed. Sign in with the new one.');
      } catch (e) {
        const f = failure(e);
        bad(() => { setOtpErr(true); setOtpMsg(f.message); if (f.attemptsLeft !== undefined) setTries(f.attemptsLeft); });
      }
      return;
    }
    setBusy(true);
    try {
      setName(await c.submitCode(challenge.challengeId, v));
      setBusy(false);
      setStep('ok');
    } catch (e) {
      const f = failure(e);
      bad(() => { setOtpErr(true); setOtpMsg(f.message); setCode(''); if (f.attemptsLeft !== undefined) setTries(f.attemptsLeft); else if (f.code === 'locked') setTries(0); });
    }
  };

  const boxes = [0, 1, 2, 3, 4, 5].map((i) => ({ v: code[i] || '', c: `${i === code.length && code.length < 6 ? 'cur ' : ''}${i < code.length ? 'f' : ''}` }));

  return {
    themeCls, rmCls: '', isAdmin: !cons, showPw: true, panelCls: cons ? 'cons' : '', shk: shake ? `shk${shake}` : '', nope: '',
    brand: c.schoolName,
    cardA: cons ? 'Schools live' : 'Attendance today', aD: rollDigits(cons ? '312' : '94.2'), aU: cons ? '' : '%',
    cardB: cons ? 'Release 2026.10.3' : 'Fees this month', bN: cons ? 'Wave 3' : '₹18.4L', bU: cons ? 'of 6' : '', bChip: cons ? 'Healthy' : '+8.7%', bChip2: cons ? '141 updated' : '62% of due',
    toastT: cons ? 'Wave 3 passed every check' : 'Attendance sent for 8 A',
    headline: cons ? 'Run every school from one calm board.' : 'Everything the school office needs, in one calm place.',
    subline: cons ? 'Releases, cells, support and billing for the whole Gradeon fleet.' : 'Attendance, fees, exams and every message to families.',
    langs: LANGS.map((l, i) => ({ n: l[0], code: l[1], on: i === lang ? 'on' : '', pick: () => { setLang(i); try { localStorage.setItem('gradeon.lang', l[1]); document.documentElement.lang = l[1]; } catch { /* ignore */ } } })),
    isCred: step === 'cred', isOtp: step === 'otp', isOk: step === 'ok',
    title: cons ? 'Console sign in' : 'Welcome back', sub: cons ? 'Gradeon team members only. Every sign-in is recorded.' : `Sign in to the ${c.shortName} staff room.`, cta: cons ? 'Continue' : 'Sign in',
    email, onEmail: (e: { target: { value: string } }) => { setEmail(e.target.value); setEmErr(''); },
    emailPh: cons ? 'you@gradeon.app' : 'you@school.edu.in or 98765 43210',
    pw, onPw: (e: { target: { value: string } }) => { setPw(e.target.value); setPwErr(false); },
    pwType: show ? 'text' : 'password', eyeD: show ? EYE_OFF : EYE_ON, eyeLabel: show ? 'Hide password' : 'Show password', toggleEye: () => setShow((s) => !s),
    emCls: emErr ? 'err shake' : '', emInv: emErr ? 'true' : 'false', emErr: !!emErr, emMsg: emErr, pwCls: pwErr ? 'err shake' : '', pwInv: pwErr ? 'true' : 'false', pwErr, pwMsg,
    showDemo: c.demoMode, fillDemo: () => { setPw('nest2026'); setPwErr(false); },
    forgot: () => void forgot(), forgotNote, isReset: resetting, newPw, onNewPw: (e: { target: { value: string } }) => { setNewPw(e.target.value); setOtpErr(false); }, npCls: '',
    idLabel: cons ? 'Gradeon email' : 'Email or phone number', idType: cons ? 'email' : 'text',
    busy, notBusy: !busy,
    next: () => void next(),
    sentTo: challenge?.maskedTo ?? email, sentBy: challenge?.channel === 'sms' ? 'text message' : 'email', validFor: Math.max(1, Math.round((challenge?.expiresInSeconds ?? 600) / 60)), back: () => { setStep('cred'); setCode(''); setOtpErr(false); setResetting(false); },
    boxes, code, otpBad: otpErr ? 'bad shake' : '', otpErr, otpMsg, tries,
    onCode: (e: { target: { value: string } }) => {
      const v = e.target.value.replace(/\D/g, '').slice(0, 6);
      setCode(v); setOtpErr(false);
      if (v.length === 6 && !resetting) setTimeout(() => void verifyNow(v), 250);
    },
    fillCode: () => {
      const full = challenge?.demoCode ?? '424242';
      let k = 0;
      clearInterval(fill.current); setCode(''); setOtpErr(false);
      fill.current = setInterval(() => { k++; setCode(full.slice(0, k)); if (k >= 6) { clearInterval(fill.current); setTimeout(() => void verifyNow(full), 350); } }, 140);
    },
    verify: () => void verifyNow(code),
    firstName: name.split(/[ @.]/)[0] || 'there', goName: c.goName, enter: c.enter,
  };
}
