import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import GoogleSignInButton from "./google-sign-in-button";
import Loader from "./loader";

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            router.push("/dashboard");
            toast.success(t("signIn.success"));
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email(t("invalidEmail")),
        password: z.string().min(8, t("passwordLength")),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <section className="auth-panel" aria-labelledby="sign-in-title">
      <div className="auth-panel-heading">
        <h1 id="sign-in-title">{t("signIn.title")}</h1>
      </div>

      <div className="auth-social">
        <GoogleSignInButton />
        <span className="auth-social-divider">{t("or")}</span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="auth-form"
      >
        <form.Field name="email">
          {(field) => (
            <div className="auth-field">
              <Label htmlFor={field.name}>{t("email")}</Label>
              <Input
                id={field.name}
                name={field.name}
                type="email"
                autoComplete="email"
                className="auth-input"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {field.state.meta.errors.map((error) => (
                <p key={error?.message} className="auth-field-error" role="alert">
                  {error?.message}
                </p>
              ))}
            </div>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <div className="auth-field">
              <Label htmlFor={field.name}>{t("password")}</Label>
              <Input
                id={field.name}
                name={field.name}
                type="password"
                autoComplete="current-password"
                className="auth-input"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {field.state.meta.errors.map((error) => (
                <p key={error?.message} className="auth-field-error" role="alert">
                  {error?.message}
                </p>
              ))}
            </div>
          )}
        </form.Field>

        <form.Subscribe
          selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button type="submit" className="auth-submit" disabled={!canSubmit || isSubmitting}>
              <span>{isSubmitting ? t("submitting") : t("signIn.button")}</span>
              <span aria-hidden="true">↗</span>
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="auth-switch">
        <Button
          variant="link"
          onClick={onSwitchToSignUp}
          className="auth-switch-button"
        >
          {t("signIn.switch")}
        </Button>
      </div>
    </section>
  );
}
