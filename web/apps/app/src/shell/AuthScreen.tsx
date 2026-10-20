import { routes } from '../routing/routes'
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  AtSign,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  challengeTwoFactor,
  fetchAuthProviders,
  finishPasskeyLogin,
  googleChallengeHref,
  isSecondStepRequired,
  isUnverifiedEmailError,
  loginUser,
  loginWithHandle,
  problemDetail,
  recoverTwoFactor,
  registerUser,
  resendConfirmation,
  startPasskeyLogin,
  type CurrentUser,
  type PublicBranding,
} from "../api/client";
import { performWebAuthnLogin } from "./webauthn";
import { BrandLockup, WaveformHero } from "../brand/SonivoMark";
import { Button, primaryButtonClass } from "../ui/button";
import { TextField } from "../ui/text-field";
import { SessionScreen } from "./GroupsChrome";
import { safeNextPath } from "../tenancy/safeNextPath";
import { useT } from "../i18n";
import { cn } from "../ui/cn";

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
 *
 * `brand` carries a group's public branding on the tenant login
 * (/auth/groups/{slug}/login, ADR-0048 D1); the brand is presentation only and never
 * changes what the form does.
 */
export function GuestAuthRoute({
  user,
  mode,
  onSuccess,
  brand = null,
}: {
  user: CurrentUser | null | undefined;
  mode: "login" | "register";
  onSuccess: (user: CurrentUser) => void;
  brand?: PublicBranding | null;
}) {
  const [searchParams] = useSearchParams();
  const { t } = useT();
  const next = safeNextPath(searchParams.get("next"));
  if (user === undefined) {
    return <SessionScreen message={t("auth.checkingSession")} />;
  }
  if (user) {
    // The dashboard lives at /app/home; the root is the public marketing
    // landing, so an authenticated visitor must not be sent there.
    return <Navigate to={next ?? routes.home} replace />;
  }
  return (
    <AuthScreen mode={mode} next={next} onSuccess={onSuccess} brand={brand} />
  );
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
      leading={<Lock className="h-4 w-4" aria-hidden="true" />}
      trailing={
        <button
          type="button"
          className="absolute right-1 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-muted transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          aria-pressed={visible}
          aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="sr-only sm:not-sr-only">
            {visible ? t("auth.hidePassword") : t("auth.showPassword")}
          </span>
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
        <p className="rounded-xl border border-error/25 bg-error/10 px-3 py-2 text-sm text-error-ink">
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
      setError(problemDetail(err, t));
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
/**
 * Verification / resend affordance.
 *
 * ADR-0038 (Q-AU-1, owner-authorized refinement): this is rendered only after a
 * login attempt that the API marked `email_unverified`. Identity's
 * `IsNotAllowed` means the password was already CORRECT, so the marker is
 * unreachable without a valid credential and cannot be used to discover whether
 * an address is registered. Every other failure — unknown email, wrong
 * password, lockout — keeps the byte-identical 401 with no marker, so the
 * response still reveals nothing about account existence.
 *
 * Rendered as one quiet line of muted copy with a single text link so it does
 * not compete with the primary action.
 */
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
    <div className="text-sm text-muted">
      <p>
        {t("auth.unverifiedHint")}{" "}
        <button
          type="button"
          className="rounded font-semibold text-primary-ink underline-offset-2 transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => {
            setOpen(true);
            setEmail((current) => current || initialEmail);
          }}
        >
          {t("auth.resendButton")}
        </button>
      </p>

      {open ? (
        <div className="mt-2 space-y-2">
          <TextField
            label={t("auth.emailLabel")}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            disabled={pending}
            error={fieldError}
            leading={<Mail className="h-4 w-4" aria-hidden="true" />}
          />
          <Button
            type="button"
            variant="secondary"
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
      ) : null}
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
  brand = null,
}: {
  mode: "login" | "register";
  next: string | null;
  onSuccess: (user: CurrentUser) => void;
  brand?: PublicBranding | null;
}) {
  const { t } = useT();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const hasBrand = Boolean(brand?.name);
  // The group brand owns the editorial half on the tenant login; on the apex
  // the panel keeps the generic product voice.
  const heroTitle = hasBrand
    ? (brand?.loginHeadline ?? brand?.name ?? t("auth.heroTitle"))
    : t("auth.heroTitle");
  const heroSubtitle = hasBrand ? t("slug.brandedLoginHint") : t("auth.heroSubtitle");

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
  // ADR-0038: set only when the API marks the failure as an unverified mailbox
  // (which itself requires a correct password), never for a plain auth failure.
  const [needsVerification, setNeedsVerification] = useState(false);

  const passkeySupported =
    typeof window !== "undefined" && "PublicKeyCredential" in window;

  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  const otherModeTo = `${mode === "login" ? routes.register : routes.login}${nextQuery}`;

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
    setNeedsVerification(false);
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
      setError(problemDetail(err, t));
      // A correct password on an unverified mailbox is the only failure that
      // carries the marker, so the affordance appears exactly when it applies.
      setNeedsVerification(isUnverifiedEmailError(err));
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
      setError(problemDetail(err, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-screen grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(26rem,32rem)]">
      {/*
        * Brand panel: the fixed editorial half of the split. It uses the group
        * accent tokens so a branded login keeps its identity on both hosts
        * (apex and {slug}.sonivo.lat). Form side is the theme-aware one.
        */}
      <section
        className="auth-screen__brand relative hidden overflow-hidden border-r border-border-subtle bg-canvas px-10 py-12 text-ink lg:flex lg:flex-col lg:justify-between xl:px-16"
        aria-hidden="false"
      >
        {/* Ambient wash from the group accent (or the global primary). */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.18]"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(120% 90% at 15% 0%, var(--brand-primary, var(--color-primary)) 0%, transparent 60%)",
          }}
        />
        {hasBrand ? (
          <div className="flex items-center gap-3">
            {brand?.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt=""
                className="h-11 w-11 rounded-xl object-contain"
              />
            ) : null}
            <span className="text-lg font-semibold tracking-tight text-ink">
              {brand?.name}
            </span>
          </div>
        ) : (
          <BrandLockup to="/" />
        )}
        <div className="max-w-md space-y-5">
          {hasBrand ? (
            <span
              className="block h-12 w-12 rounded-2xl bg-cover bg-center"
              style={{
                backgroundImage: brand?.logoUrl
                  ? `url(${brand.logoUrl})`
                  : undefined,
              }}
              role="img"
              aria-label={brand?.name ?? ""}
            />
          ) : null}
          <h2 className="max-w-[15ch] text-balance text-5xl font-bold leading-[1.05] tracking-[-0.03em] text-ink xl:text-6xl">
            {heroTitle}
          </h2>
          <p className="max-w-[42ch] text-balance text-lg text-muted">
            {heroSubtitle}
          </p>
        </div>
        <WaveformHero className="max-w-xl opacity-70" />
      </section>

      <main className="auth-screen__main flex flex-col justify-center bg-canvas px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[26rem]">
          {/* On mobile the form leads; the brand is a compact lockup above it.
              A group door shows the group's own name, never Sonivo's. */}
          <div className="mb-8 flex items-center justify-between gap-3 lg:hidden">
            {hasBrand ? (
              <span className="text-lg font-semibold tracking-tight text-ink">
                {brand?.name}
              </span>
            ) : (
              <BrandLockup to="/" />
            )}
          </div>

          <div className="auth-screen__card rounded-2xl border border-border-subtle bg-surface p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.12)] sm:p-8">
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
                  className={cn(primaryButtonClass, "no-underline")}
                  to={`${routes.login}${nextQuery}`}
                >
                  {t("auth.goLogin")}
                </Link>
              </div>
            ) : (
              <form
                className="space-y-5"
                onSubmit={onSubmit}
                noValidate
                aria-labelledby={headingId}
              >
                <div className="space-y-1.5">
                  <h1
                    id={headingId}
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-2xl font-bold tracking-tight outline-none sm:text-[1.75rem]"
                  >
                    {mode === "login"
                      ? t("auth.loginTitle")
                      : t("auth.registerTitle")}
                  </h1>
                  <p className="text-sm text-muted">
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

                {/*
                  ADR-0047: a member without an email signs in as `handle@slug`.
                  The field accepts either identifier, so the label says so and
                  the inline input mode stays `email` for the common case.
                */}
                <TextField
                  label={
                    mode === "login"
                      ? t("auth.identifierLabel")
                      : t("auth.emailLabel")
                  }
                  type="text"
                  inputMode="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (needsVerification) setNeedsVerification(false);
                  }}
                  autoComplete={
                    mode === "login" ? "username" : "email"
                  }
                  error={errors.email}
                  hint={mode === "login" ? t("auth.identifierHint") : undefined}
                  autoFocus
                  disabled={pending}
                  leading={
                    mode === "login" ? (
                      <AtSign className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Mail className="h-4 w-4" aria-hidden="true" />
                    )
                  }
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
                  <p className="-mt-3 text-xs text-muted">{t("auth.passwordHint")}</p>
                ) : (
                  /* Forgotten password is a login affordance, so it lives here
                     rather than only inside the verification block. */
                  <div className="-mt-2 flex justify-end">
                    <Link
                      className="rounded text-sm font-semibold text-primary-ink underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      to={routes.forgotPassword}
                    >
                      {t("auth.forgotLink")}
                    </Link>
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={pending}
                >
                  {pending ? (
                    t("auth.working")
                  ) : (
                    <>
                      {mode === "login"
                        ? t("auth.loginTitle")
                        : t("auth.registerTitle")}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </Button>

                {(mode === "login" && passkeySupported) || googleEnabled ? (
                  <div className="relative py-1 text-center">
                    <span className="relative z-10 bg-surface px-3 text-xs font-medium uppercase tracking-[0.14em] text-muted">
                      {t("auth.dividerWith")}
                    </span>
                    <span
                      className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-subtle"
                      aria-hidden
                    />
                  </div>
                ) : null}

                {mode === "login" && passkeySupported ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    disabled={pending}
                    onClick={() => void onPasskeyLogin()}
                  >
                    <Fingerprint className="h-4 w-4" aria-hidden="true" />
                    {t("auth.passkeyButton")}
                  </Button>
                ) : null}

                {googleEnabled ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    disabled={pending}
                    onClick={() =>
                      window.location.assign(googleChallengeHref(next))
                    }
                  >
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                    {t("auth.googleButton")}
                  </Button>
                ) : null}

                {/*
                  ADR-0038: the unverified affordance appears only when the API
                  marks the failure as such, which already requires a correct
                  password — so it is never a signal that a mailbox exists.
                */}
                {mode === "login" && needsVerification ? (
                  <ResendBlock initialEmail={email} />
                ) : null}

                {/*
                  Joining a group is by invitation, never self-registration, so a
                  group door does not offer "create an account".
                */}
                {mode === "register" || !hasBrand ? (
                  <p className="text-sm text-muted">
                    {mode === "login"
                      ? t("auth.noAccountPrefix")
                      : t("auth.hasAccountPrefix")}
                    <Link
                      className="rounded font-semibold text-primary-ink underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      to={otherModeTo}
                    >
                      {mode === "login"
                        ? t("auth.registerLink")
                        : t("auth.loginLink")}
                    </Link>
                  </p>
                ) : null}

                <p className="flex items-start gap-2 border-t border-border-subtle pt-5 text-xs text-muted">
                  <ShieldCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted"
                    aria-hidden="true"
                  />
                  {t("auth.securityNote")}
                </p>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
