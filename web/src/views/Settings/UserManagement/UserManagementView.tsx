import { type FormEvent, useMemo, useState } from "react";

import {
    Box,
    Button,
    Checkbox,
    Chip,
    Container,
    Divider,
    FormControlLabel,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

import { useNotifications } from "@contexts/NotificationsContext";
import { type AdminCreateUserPayload, createAdminUser } from "@services/AdminUsers";

const UserManagementView = () => {
    const { t: translate } = useTranslation("settings");
    const { createErrorNotification, createSuccessNotification } = useNotifications();
    const theme = useTheme();

    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [groups, setGroups] = useState("");
    const [disabled, setDisabled] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const groupValues = useMemo(
        () =>
            groups
                .split(",")
                .map((group) => group.trim())
                .filter((group) => group !== ""),
        [groups],
    );

    const resetForm = () => {
        setUsername("");
        setDisplayName("");
        setEmail("");
        setPassword("");
        setGroups("");
        setDisabled(false);
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const payload: AdminCreateUserPayload = {
            disabled,
            display_name: displayName.trim(),
            email: email.trim(),
            groups: groupValues,
            password,
            username: username.trim(),
        };

        if (payload.username === "" || payload.display_name === "" || payload.password === "") {
            createErrorNotification(translate("Username, display name, and password are required"));

            return;
        }

        setSubmitting(true);

        try {
            await createAdminUser(payload);
            createSuccessNotification(translate("User created successfully"));
            resetForm();
        } catch (error) {
            console.error(error);
            createErrorNotification(translate("There was an issue creating the user"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Container
            sx={{
                alignItems: "flex-start",
                display: "flex",
                justifyContent: "center",
                pt: 6,
                px: { md: 3, xs: 1.5 },
            }}
        >
            <Paper
                variant="outlined"
                sx={{
                    borderColor: alpha(theme.palette.primary.main, 0.18),
                    borderRadius: 3,
                    boxShadow: `0 18px 48px ${alpha(theme.palette.common.black, 0.08)}`,
                    maxWidth: 760,
                    overflow: "hidden",
                    width: "100%",
                }}
            >
                <Box
                    sx={{
                        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.background.paper, 0)})`,
                        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                        p: { md: 4, xs: 2.5 },
                    }}
                >
                    <Stack spacing={1}>
                        <Typography color="primary" fontWeight={700} variant="overline">
                            {translate("Administration")}
                        </Typography>
                        <Typography variant="h4">{translate("User Management")}</Typography>
                        <Typography color="text.secondary" sx={{ maxWidth: 560 }}>
                            {translate("Create users in the configured authentication backend")}
                        </Typography>
                    </Stack>
                </Box>
                <Box component="form" onSubmit={handleSubmit} sx={{ p: { md: 4, xs: 2.5 } }}>
                    <Stack spacing={3}>
                        <Box
                            sx={{
                                columnGap: 2,
                                display: "grid",
                                gridTemplateColumns: { md: "1fr 1fr", xs: "1fr" },
                                rowGap: 2,
                            }}
                        >
                            <TextField
                                id="admin-create-user-username"
                                label={translate("Username")}
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                required
                                fullWidth
                            />
                            <TextField
                                id="admin-create-user-display-name"
                                label={translate("Display Name")}
                                value={displayName}
                                onChange={(event) => setDisplayName(event.target.value)}
                                required
                                fullWidth
                            />
                            <TextField
                                id="admin-create-user-email"
                                label={translate("Email")}
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                fullWidth
                            />
                            <TextField
                                id="admin-create-user-password"
                                label={translate("Password")}
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                required
                                fullWidth
                            />
                        </Box>
                        <Stack spacing={1.25}>
                            <TextField
                                id="admin-create-user-groups"
                                label={translate("Groups")}
                                helperText={translate("Separate groups with commas")}
                                value={groups}
                                onChange={(event) => setGroups(event.target.value)}
                                fullWidth
                            />
                            {groupValues.length > 0 ? (
                                <Stack direction="row" flexWrap="wrap" gap={1}>
                                    {groupValues.map((group) => (
                                        <Chip key={group} label={group} size="small" variant="outlined" />
                                    ))}
                                </Stack>
                            ) : null}
                        </Stack>
                        <Divider />
                        <Box
                            sx={{
                                alignItems: { md: "center", xs: "stretch" },
                                display: "flex",
                                flexDirection: { md: "row", xs: "column" },
                                gap: 2,
                                justifyContent: "space-between",
                            }}
                        >
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={disabled}
                                        onChange={(event) => setDisabled(event.target.checked)}
                                    />
                                }
                                label={translate("Create user as disabled")}
                            />
                            <Button type="submit" variant="contained" disabled={submitting} sx={{ minWidth: 160 }}>
                                {submitting ? translate("Creating") : translate("Create User")}
                            </Button>
                        </Box>
                    </Stack>
                </Box>
            </Paper>
        </Container>
    );
};

export default UserManagementView;
