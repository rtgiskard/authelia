import { Fragment, useCallback, useEffect, useState } from "react";

import { Box, Button, Container, List, ListItem, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import { useNotifications } from "@contexts/NotificationsContext";
import { useConfiguration } from "@hooks/Configuration";
import { useUserInfoGET } from "@hooks/UserInfo";
import type { Configuration } from "@models/Configuration";
import { getUserSessionElevation } from "@services/UserSessionElevation";
import type { UserSessionElevation } from "@services/UserSessionElevation";
import IdentityVerificationDialog from "@views/Settings/Common/IdentityVerificationDialog";
import SecondFactorDialog from "@views/Settings/Common/SecondFactorDialog";
import ChangePasswordDialog, { type ChangePasswordFlowState } from "@views/Settings/Security/ChangePasswordDialog";

interface PasswordChangeButtonProps {
    configuration: Configuration | undefined;
    translate: (_key: string) => string;
    handleChangePassword: () => void;
}

const PasswordChangeButton = ({ configuration, handleChangePassword, translate }: PasswordChangeButtonProps) => {
    const buttonContent = (
        <Button
            id="change-password-button"
            variant="contained"
            sx={{ p: 1, width: "100%" }}
            onClick={handleChangePassword}
            disabled={!configuration || configuration.password_change_disabled}
        >
            {translate("Change Password")}
        </Button>
    );

    return !configuration || configuration.password_change_disabled ? (
        <Tooltip title={translate("This is disabled by your administrator")}>
            <Box component={"span"}>{buttonContent}</Box>
        </Tooltip>
    ) : (
        buttonContent
    );
};

const SettingsView = () => {
    const { t: translate } = useTranslation(["settings", "portal"]);
    const { createErrorNotification } = useNotifications();

    const [userInfo, fetchUserInfo, , fetchUserInfoError] = useUserInfoGET();
    const [elevation, setElevation] = useState<UserSessionElevation>();
    const [dialogSFOpening, setDialogSFOpening] = useState(false);
    const [dialogIVOpening, setDialogIVOpening] = useState(false);
    const [dialogPWChangeOpen, setDialogPWChangeOpen] = useState(false);
    const [dialogPWChangeOpening, setDialogPWChangeOpening] = useState(false);
    const [dialogPWChangeFlow, setDialogPWChangeFlow] = useState<ChangePasswordFlowState>("preparing");
    const [configuration, fetchConfiguration, , fetchConfigurationError] = useConfiguration();

    const handleResetStateOpening = useCallback(() => {
        setDialogSFOpening(false);
        setDialogIVOpening(false);
        setDialogPWChangeOpening(false);
    }, []);

    const handleResetState = useCallback(() => {
        handleResetStateOpening();

        setElevation(undefined);
        setDialogPWChangeOpen(false);
        setDialogPWChangeFlow("preparing");
    }, [handleResetStateOpening]);

    const handleOpenChangePWDialog = useCallback(() => {
        handleResetStateOpening();
        setDialogPWChangeFlow("ready");
    }, [handleResetStateOpening]);

    const handleSFDialogClosed = (ok: boolean, changed: boolean) => {
        if (!ok) {
            console.warn("Second Factor dialog close callback failed, it was likely cancelled by the user.");

            handleResetState();

            return;
        }

        if (changed) {
            handleElevationRefresh()
                .then((refreshedElevation) => {
                    if (refreshedElevation) {
                        const isElevatedFromRefresh =
                            refreshedElevation.elevated || refreshedElevation.skip_second_factor;
                        if (isElevatedFromRefresh) {
                            setElevation(undefined);
                            if (dialogPWChangeOpening) {
                                handleOpenChangePWDialog();
                            }
                        } else {
                            setDialogIVOpening(true);
                        }
                    }
                })
                .catch((error) => {
                    console.error(error);
                    createErrorNotification(translate("Failed to get session elevation status"));
                });
        } else {
            const isElevated = elevation && (elevation.elevated || elevation.skip_second_factor);
            if (isElevated) {
                setElevation(undefined);
                if (dialogPWChangeOpening) {
                    handleOpenChangePWDialog();
                }
            } else {
                setDialogIVOpening(true);
            }
        }
    };

    const handleSFDialogOpened = () => {
        setDialogSFOpening(false);
    };

    const handleIVDialogClosed = useCallback(
        (ok: boolean) => {
            if (!ok) {
                console.warn(
                    "Identity Verification dialog close callback failed, it was likely cancelled by the user.",
                );

                handleResetState();

                return;
            }

            setElevation(undefined);
            if (dialogPWChangeOpening) {
                handleOpenChangePWDialog();
            }
        },
        [dialogPWChangeOpening, handleOpenChangePWDialog, handleResetState],
    );

    const handleIVDialogOpened = () => {
        setDialogIVOpening(false);
    };

    const handleElevationRefresh = async () => {
        const result = await getUserSessionElevation();
        setElevation(result);
        return result;
    };

    const handleElevation = () => {
        setDialogPWChangeFlow("preparing");
        handleElevationRefresh()
            .then(() => {
                setDialogPWChangeFlow("verifying");
                setDialogSFOpening(true);
            })
            .catch((error) => {
                console.error(error);
                createErrorNotification(translate("Failed to get session elevation status"));
                handleResetState();
            });
    };

    const handleChangePassword = () => {
        setDialogPWChangeOpen(true);
        setDialogPWChangeOpening(true);

        handleElevation();
    };

    useEffect(() => {
        if (fetchUserInfoError) {
            createErrorNotification(translate("There was an issue retrieving user preferences", { ns: "portal" }));
        }
        if (fetchConfigurationError) {
            createErrorNotification(translate("There was an issue retrieving configuration"));
        }
    }, [fetchUserInfoError, fetchConfigurationError, createErrorNotification, translate]);

    useEffect(() => {
        fetchUserInfo();
        fetchConfiguration();
    }, [fetchUserInfo, fetchConfiguration]);

    return (
        <Fragment>
            <SecondFactorDialog
                info={userInfo}
                elevation={elevation}
                opening={dialogSFOpening}
                handleClosed={handleSFDialogClosed}
                handleOpened={handleSFDialogOpened}
            />
            <IdentityVerificationDialog
                opening={dialogIVOpening}
                elevation={elevation}
                handleClosed={handleIVDialogClosed}
                handleOpened={handleIVDialogOpened}
            />
            <ChangePasswordDialog
                username={userInfo?.display_name || ""}
                open={dialogPWChangeOpen}
                flow={dialogPWChangeFlow}
                setFlow={setDialogPWChangeFlow}
                setClosed={() => {
                    handleResetState();
                }}
            />

            <Container
                maxWidth="md"
                sx={{
                    alignItems: "flex-start",
                    display: "flex",
                    minHeight: "100vh",
                    justifyContent: "center",
                    pb: 4,
                    pt: 8,
                }}
            >
                <Stack spacing={3} sx={{ width: "100%" }}>
                    <Paper variant="outlined" sx={{ p: { md: 3, xs: 2 } }}>
                        <Stack spacing={2}>
                            <Typography variant="h6">{translate("Profile")}</Typography>
                            <Box>
                                <Typography variant="body2" color="text.secondary">
                                    {translate("Name")}
                                </Typography>
                                <Typography>{userInfo?.display_name || ""}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="body2" color="text.secondary">
                                    {translate("Email")}
                                </Typography>
                                <Typography>{userInfo?.emails?.[0] || ""}</Typography>
                                {userInfo?.emails && userInfo.emails.length > 1 && (
                                    <List sx={{ p: 0, pl: 2, width: "100%" }}>
                                        {userInfo.emails.slice(1).map((email: string) => (
                                            <ListItem key={email} sx={{ py: 0 }}>
                                                <Typography>{email}</Typography>
                                            </ListItem>
                                        ))}
                                    </List>
                                )}
                            </Box>
                        </Stack>
                    </Paper>
                    <Paper variant="outlined" sx={{ p: { md: 3, xs: 2 } }}>
                        <Stack spacing={2}>
                            <Typography variant="h6">{translate("Password")}</Typography>
                            <Typography>{translate("Password")}: ●●●●●●●●</Typography>
                            <Typography color="text.secondary">
                                {translate("Update your password after verifying your identity")}
                            </Typography>
                            <PasswordChangeButton
                                configuration={configuration}
                                translate={translate}
                                handleChangePassword={handleChangePassword}
                            />
                        </Stack>
                    </Paper>
                </Stack>
            </Container>
        </Fragment>
    );
};

export default SettingsView;
