import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import {
    Alert,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import axios from "axios";
import { useTranslation } from "react-i18next";

import PasswordMeter from "@components/PasswordMeter";
import { useNotifications } from "@contexts/NotificationsContext";
import useCheckCapsLock from "@hooks/CapsLock";
import { PasswordPolicyMode, type PasswordPolicyConfiguration } from "@models/PasswordPolicy";
import { postPasswordChange } from "@services/ChangePassword";
import { getPasswordPolicyConfiguration } from "@services/PasswordPolicyConfiguration";

export type ChangePasswordFlowState = "preparing" | "verifying" | "ready" | "success";

interface Props {
    username: string;
    disabled?: boolean;
    flow: ChangePasswordFlowState;
    open: boolean;
    setClosed: () => void;
    setFlow: (flow: ChangePasswordFlowState) => void;
}

const ChangePasswordDialog = (props: Props) => {
    const { t: translate } = useTranslation(["settings", "portal"]);

    const { createErrorNotification, createSuccessNotification } = useNotifications();

    const [loading, setLoading] = useState(true);
    const [oldPassword, setOldPassword] = useState("");
    const [oldPasswordError, setOldPasswordError] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [newPasswordError, setNewPasswordError] = useState(false);
    const [repeatNewPassword, setRepeatNewPassword] = useState("");
    const [repeatNewPasswordError, setRepeatNewPasswordError] = useState(false);
    const [isCapsLockOnOldPW, setIsCapsLockOnOldPW] = useState(false);
    const [isCapsLockOnNewPW, setIsCapsLockOnNewPW] = useState(false);
    const [isCapsLockOnRepeatNewPW, setIsCapsLockOnRepeatNewPW] = useState(false);

    const oldPasswordRef = useRef<HTMLInputElement | null>(null);
    const newPasswordRef = useRef<HTMLInputElement | null>(null);
    const repeatNewPasswordRef = useRef<HTMLInputElement | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [pPolicy, setPPolicy] = useState<PasswordPolicyConfiguration>({
        max_length: 0,
        min_length: 8,
        min_score: 0,
        mode: PasswordPolicyMode.Disabled,
        require_lowercase: false,
        require_number: false,
        require_special: false,
        require_uppercase: false,
    });

    const handleOldPWCapsLock = useCheckCapsLock(setIsCapsLockOnOldPW);
    const handleNewPWCapsLock = useCheckCapsLock(setIsCapsLockOnNewPW);
    const handleRepeatNewPWCapsLock = useCheckCapsLock(setIsCapsLockOnRepeatNewPW);

    const resetPasswordErrors = useCallback(() => {
        setOldPasswordError(false);
        setNewPasswordError(false);
        setRepeatNewPasswordError(false);
    }, []);

    const resetCapsLockErrors = useCallback(() => {
        setIsCapsLockOnOldPW(false);
        setIsCapsLockOnNewPW(false);
        setIsCapsLockOnRepeatNewPW(false);
    }, []);

    const resetStates = useCallback(() => {
        setOldPassword("");
        setNewPassword("");
        setRepeatNewPassword("");

        resetPasswordErrors();
        resetCapsLockErrors();

        setLoading(true);
    }, [resetPasswordErrors, resetCapsLockErrors]);

    const handleClose = useCallback(() => {
        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }

        props.setClosed();
        resetStates();
    }, [props, resetStates]);

    useEffect(() => {
        if (!props.open || props.flow !== "ready") {
            return;
        }

        let active = true;

        (async () => {
            try {
                const policy = await getPasswordPolicyConfiguration();
                if (active) {
                    setPPolicy(policy);
                    setLoading(false);
                }
            } catch {
                createErrorNotification(
                    translate("There was an issue completing the process the verification token might have expired", {
                        ns: "portal",
                    }),
                );
            }
        })();

        return () => {
            active = false;
        };
    }, [createErrorNotification, props.flow, props.open, translate]);

    useEffect(() => {
        return () => {
            if (closeTimer.current) {
                clearTimeout(closeTimer.current);
                closeTimer.current = null;
            }
        };
    }, []);

    const handlePasswordChange = useCallback(async () => {
        setLoading(true);
        if (oldPassword.trim() === "" || newPassword.trim() === "" || repeatNewPassword.trim() === "") {
            if (oldPassword.trim() === "") {
                setOldPasswordError(true);
            }
            if (newPassword.trim() === "") {
                setNewPasswordError(true);
            }
            if (repeatNewPassword.trim() === "") {
                setRepeatNewPasswordError(true);
            }
            setLoading(false);
            return;
        }
        if (newPassword !== repeatNewPassword) {
            setNewPasswordError(true);
            setRepeatNewPasswordError(true);
            createErrorNotification(translate("Passwords do not match"));
            setLoading(false);
            return;
        }

        try {
            await postPasswordChange(props.username, oldPassword, newPassword);
            resetPasswordErrors();
            setLoading(false);
            props.setFlow("success");
            createSuccessNotification(translate("Password changed successfully"));
            closeTimer.current = setTimeout(handleClose, 1200);
        } catch (err) {
            resetPasswordErrors();
            setLoading(false);
            if (axios.isAxiosError(err) && err.response) {
                switch (err.response.status) {
                    case 400: // Bad Request - Weak Password
                        setNewPasswordError(true);
                        setRepeatNewPasswordError(true);
                        createErrorNotification(
                            translate("Your supplied password does not meet the password policy requirements"),
                        );
                        break;

                    case 401: // Unauthorized - Incorrect Password
                        setOldPasswordError(true);
                        createErrorNotification(translate("Incorrect password"));
                        break;

                    default:
                        createErrorNotification(translate("There was an issue changing the password"));
                        break;
                }
            } else {
                // Handle non-axios errors
                createErrorNotification(translate("There was an issue changing the password"));
            }
            return;
        }
    }, [
        createErrorNotification,
        createSuccessNotification,
        resetPasswordErrors,
        handleClose,
        newPassword,
        oldPassword,
        props,
        repeatNewPassword,
        translate,
    ]);

    const handleOldPWKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== "Enter") return;
            if (!oldPassword.length) {
                setOldPasswordError(true);
            } else if (newPasswordRef.current) {
                newPasswordRef.current.focus();
            }
        },
        [oldPassword.length],
    );

    const handleNewPWKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== "Enter") return;
            if (!newPassword.length) {
                setNewPasswordError(true);
            } else if (repeatNewPasswordRef.current) {
                repeatNewPasswordRef.current.focus();
            }
        },
        [newPassword.length],
    );

    const handleRepeatNewPWKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== "Enter") return;
            if (!repeatNewPassword.length) {
                setRepeatNewPasswordError(true);
            } else {
                handlePasswordChange().catch(console.error);
            }
        },
        [handlePasswordChange, repeatNewPassword.length],
    );

    const disabled = props.disabled || false;

    const renderFlowContent = () => {
        switch (props.flow) {
            case "preparing":
                return (
                    <Stack spacing={2} alignItems="center" sx={{ py: 3 }}>
                        <CircularProgress size={32} />
                        <Typography>{translate("Preparing password change")}</Typography>
                        <Typography color="text.secondary" textAlign="center">
                            {translate("Checking whether additional identity verification is required")}
                        </Typography>
                    </Stack>
                );
            case "verifying":
                return (
                    <Stack spacing={2} alignItems="center" sx={{ py: 3 }}>
                        <CircularProgress size={32} />
                        <Typography>{translate("Verifying your identity")}</Typography>
                        <Typography color="text.secondary" textAlign="center">
                            {translate("Complete identity verification to unlock the password fields")}
                        </Typography>
                    </Stack>
                );
            case "success":
                return <Alert severity="success">{translate("Password changed successfully")}</Alert>;
            case "ready":
                return (
                    <FormControl id={"change-password-form"} disabled={loading}>
                        <Grid container spacing={1} alignItems={"center"} justifyContent={"center"} textAlign={"center"}>
                            <Grid size={{ xs: 12 }} sx={{ pt: 3 }}>
                                <TextField
                                    inputRef={oldPasswordRef}
                                    id="old-password"
                                    label={translate("Old Password")}
                                    variant="outlined"
                                    required
                                    value={oldPassword}
                                    error={oldPasswordError}
                                    disabled={disabled}
                                    fullWidth
                                    onChange={(v) => setOldPassword(v.target.value)}
                                    onFocus={() => setOldPasswordError(false)}
                                    type="password"
                                    autoCapitalize="off"
                                    autoComplete="off"
                                    onKeyDown={handleOldPWKeyDown}
                                    onKeyUp={handleOldPWCapsLock}
                                    helperText={isCapsLockOnOldPW ? translate("Caps Lock is on") : " "}
                                    color={isCapsLockOnOldPW ? "error" : "primary"}
                                    onBlur={() => setIsCapsLockOnOldPW(false)}
                                />
                            </Grid>
                            <Grid size={{ xs: 12 }} sx={{ mt: 3 }}>
                                <TextField
                                    inputRef={newPasswordRef}
                                    id="new-password"
                                    label={translate("New Password")}
                                    variant="outlined"
                                    required
                                    fullWidth
                                    disabled={disabled}
                                    value={newPassword}
                                    error={newPasswordError}
                                    onChange={(v) => setNewPassword(v.target.value)}
                                    onFocus={() => setNewPasswordError(false)}
                                    type="password"
                                    autoCapitalize="off"
                                    autoComplete="off"
                                    onKeyDown={handleNewPWKeyDown}
                                    onKeyUp={handleNewPWCapsLock}
                                    helperText={isCapsLockOnNewPW ? translate("Caps Lock is on") : " "}
                                    color={isCapsLockOnNewPW ? "error" : "primary"}
                                    onBlur={() => setIsCapsLockOnNewPW(false)}
                                />
                                {pPolicy.mode === PasswordPolicyMode.Disabled ? null : (
                                    <PasswordMeter value={newPassword} policy={pPolicy} />
                                )}
                            </Grid>
                            <Grid size={{ xs: 12 }}>
                                <TextField
                                    inputRef={repeatNewPasswordRef}
                                    id="repeat-new-password"
                                    label={translate("Repeat New Password")}
                                    variant="outlined"
                                    required
                                    fullWidth
                                    disabled={disabled}
                                    value={repeatNewPassword}
                                    error={repeatNewPasswordError}
                                    onChange={(v) => setRepeatNewPassword(v.target.value)}
                                    onFocus={() => setRepeatNewPasswordError(false)}
                                    type="password"
                                    autoCapitalize="off"
                                    autoComplete="off"
                                    onKeyDown={handleRepeatNewPWKeyDown}
                                    onKeyUp={handleRepeatNewPWCapsLock}
                                    helperText={isCapsLockOnRepeatNewPW ? translate("Caps Lock is on") : " "}
                                    color={isCapsLockOnRepeatNewPW ? "error" : "primary"}
                                    onBlur={() => setIsCapsLockOnRepeatNewPW(false)}
                                />
                            </Grid>
                        </Grid>
                    </FormControl>
                );
        }
    };

    return (
        <Dialog open={props.open} maxWidth="xs">
            <DialogTitle>{translate("Change Password")}</DialogTitle>
            <DialogContent>{renderFlowContent()}</DialogContent>
            {props.flow === "success" ? null : (
                <DialogActions>
                    <Button id={"password-change-dialog-cancel"} color={"error"} onClick={handleClose}>
                        {translate("Cancel")}
                    </Button>
                    {props.flow === "ready" ? (
                        <Button
                            id={"password-change-dialog-submit"}
                            color={"primary"}
                            onClick={handlePasswordChange}
                            disabled={!(oldPassword.length && newPassword.length && repeatNewPassword.length) || loading}
                            startIcon={loading ? <CircularProgress color="inherit" size={20} /> : undefined}
                        >
                            {translate("Change Password")}
                        </Button>
                    ) : null}
                </DialogActions>
            )}
        </Dialog>
    );
};

export default ChangePasswordDialog;
