"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Gauge, Loader2 } from "lucide-react";
import { requestAccess } from "@/app/signup/actions";

const ROLES = [
  { value: "accounts", label: "Accounts" },
  { value: "central vision", label: "Central Vision" },
  { value:"drawing", label: "Drawing" },
  {value: "assembly", label: "Assembly" },
  { value:"QC", label: "QC" },
  { value:"planning", label: "Planning" },
  { value:"purhase", label: "Purchase" },
  { value: "billing", label: "Billing" },
  {value:"admin", label: "Admin" },
];

type FieldErrors = {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  role?: string;
};

function validate(values: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.fullName.trim()) errors.fullName = "Full name is required.";

  if (!values.email.trim()) errors.email = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
    errors.email = "Enter a valid email address.";

  if (!values.password) errors.password = "Password is required.";
  else if (values.password.length < 6)
    errors.password = "Password must be at least 6 characters.";

  if (!values.confirmPassword)
    errors.confirmPassword = "Please confirm your password.";
  else if (values.confirmPassword !== values.password)
    errors.confirmPassword = "Passwords do not match.";

  if (!values.role) errors.role = "Please select a role.";

  return errors;
}

export function SignupForm() {
  const router = useRouter();
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update<K extends keyof typeof values>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate(values);
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    const result = await requestAccess(values);

    if (!result.ok) {
      setIsSubmitting(false);
      setFormError(result.error);
      return;
    }

    // Back to login with a "request submitted" alert.
    router.replace("/login?requested=1");
  }

  const inputClass =
    "h-11 w-full rounded-[10px] border border-input-border bg-white px-[15px] text-[14px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20";
  const labelClass = "mb-1.5 block text-[13px] font-semibold text-brand-label";

  return (
    <div className="w-full max-w-[380px]">
      {/* mobile logo (brand panel hidden on small screens) */}
      <div className="mb-5 flex items-center gap-3 lg:hidden">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Gauge className="h-5 w-5" />
        </div>
        <span className="font-display text-lg font-semibold tracking-tight text-foreground">
          Risansi
        </span>
      </div>

      <div className="mb-5">
        <h1 className="mb-1.5 font-display text-[26px] font-bold tracking-[-0.02em] text-foreground">
          Request access
        </h1>
        <p className="text-sm text-muted">
          Create your account to join the Risansi platform.
        </p>
      </div>

      <form noValidate onSubmit={handleSubmit}>
        {formError && (
          <div
            role="alert"
            className="mb-5 rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-sm text-danger"
          >
            {formError}
          </div>
        )}

        {/* full name */}
        <label htmlFor="fullName" className={labelClass}>
          Full name
        </label>
        <div className="mb-3.5">
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            value={values.fullName}
            onChange={(event) => update("fullName", event.target.value)}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? "fullName-error" : undefined}
            className={inputClass}
            placeholder="Full Name"
          />
          {errors.fullName && (
            <p id="fullName-error" className="mt-1.5 text-xs text-danger">
              {errors.fullName}
            </p>
          )}
        </div>

        {/* email */}
        <label htmlFor="email" className={labelClass}>
          Email address
        </label>
        <div className="mb-3.5">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={inputClass}
            placeholder="name@risansi.com"
          />
          {errors.email && (
            <p id="email-error" className="mt-1.5 text-xs text-danger">
              {errors.email}
            </p>
          )}
        </div>

        {/* password */}
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <div className="mb-3.5">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(event) => update("password", event.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
            className={inputClass}
            placeholder="At least 6 characters"
          />
          {errors.password && (
            <p id="password-error" className="mt-1.5 text-xs text-danger">
              {errors.password}
            </p>
          )}
        </div>

        {/* confirm password */}
        <label htmlFor="confirmPassword" className={labelClass}>
          Confirm password
        </label>
        <div className="mb-3.5">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={(event) => update("confirmPassword", event.target.value)}
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={
              errors.confirmPassword ? "confirmPassword-error" : undefined
            }
            className={inputClass}
            placeholder="Re-enter your password"
          />
          {errors.confirmPassword && (
            <p id="confirmPassword-error" className="mt-1.5 text-xs text-danger">
              {errors.confirmPassword}
            </p>
          )}
        </div>

        {/* role */}
        <label htmlFor="role" className={labelClass}>
          Role
        </label>
        <div className="mb-4">
          <div className="relative">
            <select
              id="role"
              name="role"
              value={values.role}
              onChange={(event) => update("role", event.target.value)}
              aria-invalid={Boolean(errors.role)}
              aria-describedby={errors.role ? "role-error" : undefined}
              className={`${inputClass} cursor-pointer appearance-none pr-[42px] ${
                values.role ? "" : "text-muted-foreground"
              }`}
            >
              <option value="" disabled>
                Select your role
              </option>
              {ROLES.map((role) => (
                <option key={role.value} value={role.value} className="text-foreground">
                  {role.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-[14px] top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          {errors.role && (
            <p id="role-error" className="mt-1.5 text-xs text-danger">
              {errors.role}
            </p>
          )}
        </div>

        {/* submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-primary font-display text-[15px] font-semibold tracking-[0.01em] text-primary-foreground shadow-[0_8px_22px_rgba(26,95,208,0.28)] transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? "Submitting..." : "Request access"}
        </button>
      </form>

      <p className="mt-4 text-center text-[13.5px] text-muted">
        Already have access?{" "}
        <a
          href="/login"
          className="font-semibold text-primary hover:text-primary-hover"
        >
          Sign in
        </a>
      </p>
      <p className="mt-4 text-center text-[11.5px] text-muted">Risansi Industries Ltd · Internal use only</p>
    </div>
  );
}
