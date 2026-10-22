// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";

import { MailCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { Button } from "@components/UI/Button";
import { Input } from "@components/UI/Input";
import { Label } from "@components/UI/Label";
import { Spinner } from "@components/UI/Spinner";
import { IndexRoute } from "@constants/Routes";
import MinimalLayout from "@layouts/MinimalLayout";
import { initiateResetPasswordProcess } from "@services/ResetPassword";

const ResetPasswordStep1 = function () {
    const [username, setUsername] = useState("");
    const [error, setError] = useState(false);
    const [requestError, setRequestError] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [rateLimited, setRateLimited] = useState(false);
    const timeoutRateLimitRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const submittingRef = useRef(false);
    const navigate = useNavigate();
    const { t: translate } = useTranslation();

    useEffect(
        () => () => {
            clearTimeout(timeoutRateLimitRef.current);
        },
        [],
    );

    const submit = async () => {
        if (submittingRef.current || rateLimited || sent) return;
        setError(false);
        setRequestError("");
        if (username.trim() === "") {
            setError(true);
            return;
        }
        submittingRef.current = true;
        setLoading(true);
        try {
            const response = await initiateResetPasswordProcess(username.trim());
            if (response?.limited === false) {
                setSent(true);
            } else if (response?.limited) {
                setRateLimited(true);
                setRequestError("You have made too many requests");
                clearTimeout(timeoutRateLimitRef.current);
                timeoutRateLimitRef.current = setTimeout(() => {
                    setRateLimited(false);
                    setRequestError("");
                    timeoutRateLimitRef.current = undefined;
                }, response.retryAfter * 1000);
            } else {
                setRequestError("There was an issue initiating the password reset process");
            }
        } catch {
            setRequestError("There was an issue initiating the password reset process");
        } finally {
            submittingRef.current = false;
            setLoading(false);
        }
    };

    return (
        <MinimalLayout
            title={translate(sent ? "Check your email" : "Reset password")}
            id="reset-password-step1-stage"
            variant="card"
        >
            {sent ? (
                <div className="space-y-6" role="status">
                    <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <MailCheck aria-hidden="true" className="size-6" />
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                        {translate(
                            "If this account has an email address, you will receive a password reset link. Check your inbox and spam folder.",
                        )}
                    </p>
                    <Button className="w-full normal-case" onClick={() => navigate(IndexRoute)}>
                        {translate("Back to sign in")}
                    </Button>
                </div>
            ) : (
                <form
                    id="form-reset-password-username"
                    className="space-y-6"
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        void submit();
                    }}
                >
                    <p className="text-sm leading-6 text-muted-foreground">
                        {translate("Enter your username to request a password reset link.")}
                    </p>
                    <div className="space-y-2">
                        <Label htmlFor="username-textfield">{translate("Username")}</Label>
                        <Input
                            id="username-textfield"
                            className="h-12 py-3"
                            autoComplete="username"
                            required
                            disabled={loading}
                            error={error}
                            aria-describedby={error ? "reset-username-error" : undefined}
                            value={username}
                            onChange={(event) => {
                                setUsername(event.target.value);
                                setError(false);
                            }}
                        />
                        {error ? (
                            <p id="reset-username-error" role="alert" className="text-sm text-destructive">
                                {translate("Username is required")}
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
                            disabled={loading || rateLimited}
                            className="h-11 w-full normal-case"
                        >
                            {loading ? <Spinner size={18} /> : null}
                            {translate("Send reset link")}
                        </Button>
                        <Button
                            id="cancel-button"
                            type="button"
                            variant="ghost"
                            disabled={loading}
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

export default ResetPasswordStep1;
