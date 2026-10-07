import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  challengeTwoFactor,
  fetchAuthProviders,
  finishPasskeyLogin,
  googleChallengeHref,
  isSecondStepRequired,
  loginUser,
  loginWithHandle,
  problemDetail,
  recoverTwoFactor,
  registerUser,
  resendConfirmation,
  startPasskeyLogin,
  type CurrentUser,
} from "../api/client";
import { performWebAuthnLogin } from "./webauthn";
import { BrandLockup, WaveformHero } from "../brand/SonivoMark";
import { Button } from "../ui/button";
import { TextField } from "../ui/text-field";
import { SessionScreen } from "./GroupsChrome";
import { safeNextPath } from "../tenancy/safeNextPath";
import { useT } from "../i18n";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** ADR-0047: `handle@slug`; the slug never contains a dot, so this cannot be an email. */
const HANDLE_LOGIN_RE = /^([a-z0-9._-]{3,32})@([a-z0-9-]{2,40})$/i;
const MIN_PASSWORD = 8;
const RESEND_COOLDOWN_S = 30;

/**
 * Solely responsible for navigating after authentication: when `onSuccess`
 * updates the user, this route redirects to `next` (already validated).
 * AuthScreen does NOT call `navigate()`, avoiding the double navigation that
 * existed before.
 */
export function GuestAuthRoute({
  user,
  mode,
  onSuccess,
}: {
  user: CurrentUser | null | undefined;
  mode: "login" | "register";
  onSuccess: (user: CurrentUser) => void;
}) {
  const [searchParams] = useSearchParams();
  const { t } = useT();
  const next = safeNextPath(searchParams.get("next"));
  if (user === undefined) {
    return <SessionScreen message={t("auth.checkingSession")} />;
  }
  if (user) {
    return <Navigate to={next ?? "/"} replace />;
  }
  return <AuthScreen mode={mode} next={next} onSuccess={onSuccess} />;
}

/* ------------------------------------------------------------------ */
/* Password field: shared TextField + show-password button.            */
/* ------------------------------------------------------------------ */
function PasswordField({
  label,
  value,
  onChange,
  error,
  autoComplete,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  autoComplete?: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const { t } = useT();

  return (
    <TextField
      label={label}
      type={visible ? "text" : "password"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete={autoComplete}
      disabled={disabled}
      error={error}
      trailing={
        <button
          type="button"
          className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg px-2 text-sm font-semibold text-shell-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? t("auth.hidePassword") : t("auth.showPassword")}
        </button>
      }
    />
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  // The live container always lives in the DOM so screen readers announce the error.
  return (
    <div role="alert" aria-live="assertive">
      {message ? (
        <p className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-shell-error">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2FA step                                                            */
/* ------------------------------------------------------------------ */
function TwoFactorStep({
  headingId,
  headingRef,
  onSuccess,
  onBack,
}: {
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSuccess: (user: CurrentUser) => void;
  onBack: () => void;
}) {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const value = code.trim();
    if (!value || (!useRecovery && value.length !== 6)) {
      setError(t("auth.codeInvalid"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      // The temporary 2FA cookie (not a session) authorizes this call.
      const user = useRecovery
        ? await recoverTwoFactor(value)
        : await challengeTwoFactor(value);
      onSuccess(user);
    } catch (err) {
      setError(problemDetail(err));
      setCode("");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={onSubmit}
      noValidate
      aria-labelledby={headingId}
    >
      <div className="space-y-1">
        <h1
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold tracking-tight outline-none"
        >
          {t("auth.twoStepTitle")}
        </h1>
        <p className="text-sm text-slate-500">
          {useRecovery
            ? t("auth.twoStepRecoveryHint")
            : t("auth.twoStepAppHint")}
        </p>
      </div>
      <ErrorBanner message={error} />
      <TextField
        key={useRecovery ? "recovery" : "totp"}
        label={
          useRecovery ? t("auth.recoveryCodeLabel") : t("auth.sixDigitLabel")
        }
        value={code}
        onChange={(event) =>
          setCode(
            useRecovery
              ? event.target.value
              : event.target.value.replace(/\D/g, "").slice(0, 6),
          )
        }
        autoComplete="one-time-code"
        inputMode={useRecovery ? "text" : "numeric"}
        maxLength={useRecovery ? 64 : 6}
        autoFocus
        disabled={pending}
      />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("auth.verifying") : t("auth.verify")}
      </Button>
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          className="text-sm font-semibold text-shell-link hover:underline"
          onClick={() => {
            setUseRecovery((v) => !v);
            setCode("");
            setError(null);
          }}
        >
          {useRecovery ? t("auth.useAppCode") : t("auth.useRecoveryCode")}
        </button>
        <button
          type="button"
          className="text-sm font-medium text-slate-500 hover:underline"
          onClick={onBack}
        >
          {t("auth.back")}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Resend confirmation (with cooldown and generic message)              */
/* ------------------------------------------------------------------ */
function ResendBlock({ initialEmail }: { initialEmail: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function onResend() {
    if (pending || cooldown > 0) return;
    if (!EMAIL_RE.test(email.trim())) {
      setFieldError(t("auth.emailInvalid"));
      return;
    }
    setFieldError(null);
    setPending(true);
    try {
      await resendConfirmation(email.trim());
    } catch {
      // Deliberately generic response: do not reveal whether the email exists or is already verified.
    } finally {
      setSent(true);
      setCooldown(RESEND_COOLDOWN_S);
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
      <p>{t("auth.unverifiedHint")}</p>
      {!open ? (
        <button
          type="button"
          className="font-semibold text-shell-link hover:underline"
          onClick={() => {
            setOpen(true);
            setEmail((current) => current || initialEmail);
          }}
        >
          {t("auth.resendButton")}
        </button>
      ) : (
        <div className="space-y-2">
          <TextField
            label={t("auth.emailLabel")}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            error={fieldError}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending || cooldown > 0}
            onClick={() => void onResend()}
          >
            {pending
              ? t("auth.resending")
              : cooldown > 0
                ? `${t("auth.resendButton")} (${cooldown}s)`
                : t("auth.resendButton")}
          </Button>
          <p role="status" aria-live="polite">
            {sent ? t("auth.resendGeneric") : null}
          </p>
        </div>
      )}
      <p>
        <Link
          className="font-semibold text-shell-link no-underline hover:underline"
          to="/forgot-password"
        >
          {t("auth.forgotLink")}
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main screen                                                         */
/* ------------------------------------------------------------------ */
function AuthScreen({
  mode,
  next,
  onSuccess,
}: {
  mode: "login" | "register";
  next: string | null;
  onSuccess: (user: CurrentUser) => void;
}) {
  const { t } = useT();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [secondStep, setSecondStep] = useState(false);

  const passkeySupported =
    typeof window !== "undefined" && "PublicKeyCredential" in window;

  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  const otherModeTo = `${mode === "login" ? "/register" : "/login"}${nextQuery}`;

  const step =
    mode === "login" && secondStep
      ? "twoFactor"
      : mode === "register" && registered
        ? "registered"
        : "form";

  // Move focus to the title when the step changes (better keyboard and screen-reader accessibility).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthProviders()
      .then((providers) => {
        if (!cancelled) setGoogleEnabled(providers.google === true);
      })
      .catch(() => {
        if (!cancelled) setGoogleEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function validate(): boolean {
    const next: { email?: string; password?: string } = {};
    const identifier = email.trim();
    const isHandleLogin = mode === "login" && HANDLE_LOGIN_RE.test(identifier);
    if (!isHandleLogin && !EMAIL_RE.test(identifier)) next.email = t("auth.emailInvalid");
    if (mode === "register" && password.length < MIN_PASSWORD)
      next.password = t("auth.passwordTooShort");
    if (mode === "login" && !password)
      next.password = t("auth.passwordRequired");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (!validate()) return;
    setPending(true);
    try {
      if (mode === "register") {
        // T-AU-01: registration never signs in; the email must be verified first.
        await registerUser({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        });
        setPassword("");
        setRegistered(true);
      } else {
        const identifier = email.trim();
        const handleMatch = HANDLE_LOGIN_RE.exec(identifier);
        const result = handleMatch
          ? await loginWithHandle({
              slug: handleMatch[2].toLowerCase(),
              handle: handleMatch[1].toLowerCase(),
              password,
            })
          : await loginUser({ email: identifier, password });
        setPassword(""); // do not keep the password in memory longer than necessary
        if (isSecondStepRequired(result)) {
          setSecondStep(true);
        } else {
          onSuccess(result); // GuestAuthRoute redirects to `next`
        }
      }
    } catch (err) {
      setError(problemDetail(err));
    } finally {
      setPending(false);
    }
  }

  async function onPasskeyLogin() {
    if (pending) return;
    if (!passkeySupported) {
      setError(t("auth.passkeyUnsupported"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { challenge, rpId } = await startPasskeyLogin();
      const result = await performWebAuthnLogin(challenge, rpId);
      // No manual fallback: a passkey is only valid with real signature and clientData.
      if (
        !result.credentialId ||
        !result.signature ||
        !result.clientDataJSON ||
        !result.authenticatorData
      ) {
        throw new Error(t("auth.passkeyRequired"));
      }
      const user = await finishPasskeyLogin({
        credentialId: result.credentialId,
        clientData: result.clientDataJSON,
        authenticatorData: result.authenticatorData,
        signature: result.signature,
      });
      onSuccess(user);
    } catch (err) {
      // Cancelling the browser dialog is not an error worth showing.
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      setError(problemDetail(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1.05fr)_minmax(24rem,30rem)]">
      {/*
       * The brand panel is intentionally dark/gradient in BOTH themes: it is the
       * fixed editorial half of the split. Only the form side is theme-aware.
       */}
      <section
        className="relative hidden overflow-hidden px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between"
        style={{
          background:
            "linear-gradient(to bottom right, #1a1440, #0F172A, #24183a)",
        }}
        aria-hidden="false"
      >
        <BrandLockup to="/login" light />
        <div className="max-w-md space-y-5">
          <h2 className="text-5xl font-extrabold leading-tight tracking-tight text-balance">
            {t("auth.heroTitle")}
          </h2>
          <p className="text-base text-slate-300">{t("auth.heroSubtitle")}</p>
          <ul className="space-y-2 text-sm text-slate-300">
            {(["auth.heroPoint1", "auth.heroPoint2", "auth.heroPoint3"] as const).map(
              (key) => (
                <li key={key} className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary"
                    aria-hidden="true"
                  />
                  {t(key)}
                </li>
              ),
            )}
          </ul>
        </div>
        <WaveformHero className="max-w-xl opacity-90" />
      </section>

      <main className="flex flex-col justify-center bg-canvas px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <BrandLockup to="/login" shell />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-surface p-6 text-ink shadow-sm sm:p-8">
            {step === "twoFactor" ? (
              <TwoFactorStep
                headingId={headingId}
                headingRef={headingRef}
                onSuccess={onSuccess}
                onBack={() => setSecondStep(false)}
              />
            ) : step === "registered" ? (
              <div className="space-y-4" role="region" aria-labelledby={headingId}>
                <div className="space-y-1">
                  <h1
                    id={headingId}
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-2xl font-bold tracking-tight outline-none"
                  >
                    {t("auth.confirmTitle")}
                  </h1>
                  <p className="text-sm text-slate-600">{t("auth.confirmSent")}</p>
                  <p className="text-sm text-slate-500">{t("auth.confirmHint")}</p>
                </div>
                <Link
                  className="inline-block font-semibold text-shell-link no-underline hover:underline"
                  to={`/login${nextQuery}`}
                >
                  {t("auth.goLogin")}
                </Link>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={onSubmit}
                noValidate
                aria-labelledby={headingId}
              >
                <div className="space-y-1">
                  <h1
                    id={headingId}
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-2xl font-bold tracking-tight outline-none"
                  >
                    {mode === "login"
                      ? t("auth.loginTitle")
                      : t("auth.registerTitle")}
                  </h1>
                  <p className="text-sm text-slate-500">
                    {mode === "login"
                      ? t("auth.loginSubtitle")
                      : t("auth.registerSubtitle")}
                  </p>
                </div>

                <ErrorBanner message={error} />

                {mode === "register" ? (
                  <TextField
                    label={t("auth.nameLabel")}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoComplete="nickname"
                    maxLength={80}
                    disabled={pending}
                  />
                ) : null}
                <TextField
                  label={t("auth.emailLabel")}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  error={errors.email}
                  autoFocus
                  disabled={pending}
                />
                <PasswordField
                  label={t("auth.passwordLabel")}
                  value={password}
                  onChange={setPassword}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  error={errors.password}
                  disabled={pending}
                />
                {mode === "register" ? (
                  <p className="-mt-2 text-xs text-slate-500">
                    {t("auth.passwordHint")}
                  </p>
                ) : null}

                <Button type="submit" className="w-full" disabled={pending}>
                  {pending
                    ? t("auth.working")
                    : mode === "login"
                      ? t("auth.loginTitle")
                      : t("auth.registerTitle")}
                </Button>

                {(mode === "login" && passkeySupported) || googleEnabled ? (
                  <div className="relative py-1 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
                    <span className="relative z-10 bg-surface px-2">
                      {t("auth.orWord")}
                    </span>
                    <span
                      className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200"
                      aria-hidden
                    />
                  </div>
                ) : null}

                {mode === "login" && passkeySupported ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={pending}
                    onClick={() => void onPasskeyLogin()}
                  >
                    {t("auth.passkeyButton")}
                  </Button>
                ) : null}

                {googleEnabled ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={pending}
                    onClick={() =>
                      window.location.assign(googleChallengeHref(next))
                    }
                  >
                    {t("auth.googleButton")}
                  </Button>
                ) : null}

                {mode === "login" ? <ResendBlock initialEmail={email} /> : null}

                <p className="text-sm text-slate-600">
                  {mode === "login"
                    ? t("auth.noAccountPrefix")
                    : t("auth.hasAccountPrefix")}
                  <Link
                    className="font-semibold text-shell-link no-underline hover:underline"
                    to={otherModeTo}
                  >
                    {mode === "login"
                      ? t("auth.registerLink")
                      : t("auth.loginLink")}
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
