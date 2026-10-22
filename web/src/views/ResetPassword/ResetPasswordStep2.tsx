// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";

import { Check, Link2Off } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import PasswordMeter from "@components/PasswordMeter";
import { Button } from "@components/UI/Button";
import { Input } from "@components/UI/Input";
import { Label } from "@components/UI/Label";
import { PasswordVisibilityToggle } from "@components/UI/PasswordVisibilityToggle";
import { Spinner } from "@components/UI/Spinner";
import { IndexRoute, ResetPasswordStep1Route } from "@constants/Routes";
import { IdentityToken } from "@constants/SearchParams";
import { usePasswordVisibility } from "@hooks/PasswordVisibility";
import { useQueryParam } from "@hooks/QueryParam";
import MinimalLayout from "@layouts/MinimalLayout";
import { PasswordPolicyConfiguration, PasswordPolicyMode } from "@models/PasswordPolicy";
import { getPasswordPolicyConfiguration } from "@services/PasswordPolicyConfiguration";
import { completeResetPasswordProcess, resetPassword } from "@services/ResetPassword";

type LinkStatus = "expired" | "invalid" | "limited" | "loading" | "ready" | "temporary" | "used";

const ResetPasswordStep2 = function () {
    const { t: translate } = useTranslation();
    const navigate = useNavigate();
    const processToken = useQueryParam(IdentityToken);
    const { showPassword, toggleProps } = usePasswordVisibility();
    const [verificationAttempt, setVerificationAttempt] = useState(0);
    const [verification, setVerification] = useState<{ attempt: number; status: LinkStatus; token?: string }>({
        attempt: -1,
        status: "loading",
    });
    const [password1, setPassword1] = useState("");
    const [password2, setPassword2] = useState("");
    const [fieldError, setFieldError] = useState<"empty" | "mismatch" | null>(null);
    const [requestError, setRequestError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const [completion, setCompletion] = useState<{ token: string; warning: boolean } | null>(null);
    const [pPolicy, setPPolicy] = useState<null | PasswordPolicyConfiguration>(null);
    const status =
        verification.token === processToken && verification.attempt === verificationAttempt
            ? verification.status
            : "loading";
    const completed = completion !== null && completion.token === processToken;
    const formDisabled = status !== "ready" || submitting || completed;

    useEffect(() => {
        let active = true;
        const verify = async () => {
            let nextStatus: LinkStatus = "invalid";
            if (processToken) {
                try {
                    const response = await completeResetPasswordProcess(processToken);
                    if (response?.limited) {
                        nextStatus = "limited";
                    } else {
                        const policy = await getPasswordPolicyConfiguration();
                        if (!active) return;
                        setPPolicy(policy);
                        nextStatus = "ready";
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : "";
                    nextStatus = message.includes("expired")
                        ? "expired"
                        : message.includes("already been used")
                          ? "used"
                          : message.includes("identity verification token")
                            ? "invalid"
                            : "temporary";
                }
            }
            if (active) setVerification({ attempt: verificationAttempt, status: nextStatus, token: processToken });
        };
        void verify();
        return () => {
            active = false;
        };
    }, [processToken, verificationAttempt]);

    const doResetPassword = async () => {
        if (!processToken || formDisabled || submittingRef.current) return;
        setRequestError("");
        if (password1 === "" || password2 === "") {
            setFieldError("empty");
            return;
        }
        if (password1 !== password2) {
            setFieldError("mismatch");
            return;
        }
        setFieldError(null);
        submittingRef.current = true;
        setSubmitting(true);
        try {
            const response = await resetPassword(processToken, password1);
            if (response?.limited) {
                setRequestError("You have made too many requests");
                return;
            }
            setPassword1("");
            setPassword2("");
            setCompletion({ token: processToken, warning: Boolean(response?.data?.reset_links_revocation_error) });
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            setRequestError(
                message.includes("0000052D.") || message.includes("policy")
                    ? "Your supplied password does not meet the password policy requirements"
                    : "There was an issue resetting the password",
            );
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    };

    const unavailable = status !== "loading" && status !== "ready";
    const canRetry = status === "temporary" || status === "limited";
    const title = completed ? "Password has been reset" : unavailable ? "Reset link unavailable" : "Enter new password";
    const unavailableMessage =
        status === "expired"
            ? "This reset link has expired. Request a new link to continue."
            : status === "used"
              ? "This reset link has already been used. If you still need to change your password, request a new link."
              : status === "limited"
                ? "You have made too many requests"
                : status === "temporary"
                  ? "We could not check your link. Please try again."
                  : "This reset link is invalid or no longer available. Request a new link to continue.";

    return (
        <MinimalLayout title={translate(title)} id="reset-password-step2-stage" variant="card">
            {completed ? (
                <div className="space-y-6" role="status">
                    <div className="flex size-11 items-center justify-center rounded-full bg-success/10 text-success">
                        <Check aria-hidden="true" className="size-6" />
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                        {translate("Your new password is ready. Use it the next time you sign in.")}
                    </p>
                    {completion.warning ? (
                        <p
                            role="alert"
                            className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm leading-6"
                        >
                            {translate(
                                "Your password was changed, but existing reset links could not be invalidated. Contact your administrator; do not repeat the reset.",
                            )}
                        </p>
                    ) : null}
                    <Button className="w-full normal-case" onClick={() => navigate(IndexRoute)}>
                        {translate("Back to sign in")}
                    </Button>
                </div>
            ) : status === "loading" ? (
                <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground" role="status">
                    <Spinner size={20} />
                    <span>{translate("Checking your reset link")}</span>
                </div>
            ) : unavailable ? (
                <div className="space-y-6">
                    <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Link2Off aria-hidden="true" className="size-5" />
                    </div>
                    <p role="alert" className="text-sm leading-6 text-muted-foreground">
                        {translate(unavailableMessage)}
                    </p>
                    <div className="space-y-2">
                        {canRetry ? (
                            <Button
                                className="w-full normal-case"
                                onClick={() => setVerificationAttempt((attempt) => attempt + 1)}
                            >
                                {translate("Retry")}
                            </Button>
                        ) : null}
                        <Button
                            className="w-full normal-case"
                            variant={canRetry ? "outline" : "default"}
                            onClick={() => navigate(ResetPasswordStep1Route)}
                        >
                            {translate("Request a new link")}
                        </Button>
                        <Button className="w-full normal-case" variant="ghost" onClick={() => navigate(IndexRoute)}>
                            {translate("Back to sign in")}
                        </Button>
                    </div>
                </div>
            ) : (
                <form
                    id="form-reset-password"
                    className="space-y-6"
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        void doResetPassword();
                    }}
                >
                    <p className="text-sm leading-6 text-muted-foreground">
                        {translate(
                            "Choose a new password for your account. Keep it private and do not reuse it elsewhere.",
                        )}
                    </p>
                    <div className="space-y-2">
                        <Label htmlFor="password1-textfield">{translate("New password")}</Label>
                        <div className="relative">
                            <Input
                                id="password1-textfield"
                                type={showPassword ? "text" : "password"}
                                value={password1}
                                disabled={formDisabled}
                                onChange={(event) => setPassword1(event.target.value)}
                                error={fieldError === "empty" && password1 === ""}
                                aria-describedby={
                                    fieldError === "empty" && password1 === "" ? "password-required" : undefined
                                }
                                className="h-12 py-3 pr-12"
                                autoComplete="new-password"
                                required
                            />
                            <PasswordVisibilityToggle
                                label={translate("Toggle password visibility")}
                                showPassword={showPassword}
                                {...toggleProps}
                            />
                        </div>
                        {fieldError === "empty" && password1 === "" ? (
                            <p id="password-required" className="text-sm text-destructive">
                                {translate("Password is required")}
                            </p>
                        ) : null}
                        {pPolicy && pPolicy.mode !== PasswordPolicyMode.Disabled ? (
                            <PasswordMeter value={password1} policy={pPolicy} />
                        ) : null}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password2-textfield">{translate("Repeat new password")}</Label>
                        <Input
                            id="password2-textfield"
                            type={showPassword ? "text" : "password"}
                            disabled={formDisabled}
                            value={password2}
                            onChange={(event) => {
                                setPassword2(event.target.value);
                                if (fieldError === "mismatch") setFieldError(null);
                            }}
                            error={fieldError === "mismatch" || (fieldError === "empty" && password2 === "")}
                            aria-describedby={fieldError ? "password-confirmation-error" : undefined}
                            className="h-12 py-3"
                            autoComplete="new-password"
                            required
                        />
                        {fieldError ? (
                            <p id="password-confirmation-error" role="alert" className="text-sm text-destructive">
                                {translate(
                                    fieldError === "mismatch" ? "Passwords do not match" : "Repeat your new password",
                                )}
                            </p>
                        ) : null}
                    </div>
                    {requestError ? (
                        <p
                            role="alert"
                            className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm leading-6 text-destructive"
                        >
                            {translate(requestError)}
                        </p>
                    ) : null}
                    <div className="space-y-2 pt-1">
                        <Button
                            id="reset-button"
                            type="submit"
                            disabled={formDisabled}
                            className="h-11 w-full normal-case"
                        >
                            {submitting ? <Spinner size={18} /> : null}
                            {translate(submitting ? "Saving" : "Save new password")}
                        </Button>
                        <Button
                            id="cancel-button"
                            type="button"
                            variant="ghost"
                            onClick={() => navigate(IndexRoute)}
                            className="w-full normal-case"
                        >
                            {translate("Back to sign in")}
                        </Button>
                    </div>
                </form>
            )}
        </MinimalLayout>
    );
};

export default ResetPasswordStep2;
