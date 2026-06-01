import { type FormEvent, Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { Add, Edit, LockReset, Person, PersonOff, Refresh, Search } from "@mui/icons-material";
import {
    Alert,
    Box,
    Button,
    Card,
    CardActions,
    CardContent,
    Checkbox,
    Chip,
    CircularProgress,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControlLabel,
    IconButton,
    InputAdornment,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

import { useNotifications } from "@contexts/NotificationsContext";
import {
    type AdminCreateUserNotificationStatus,
    type AdminCreateUserPayload,
    type AdminCreateUserResponse,
    type AdminPasswordResetPayload,
    type AdminUpdateUserPayload,
    type AdminUser,
    type AdminUserManagementCapabilities,
    createAdminUser,
    getAdminUser,
    getAdminUserManagementCapabilities,
    listAdminUsers,
    resetAdminUserPassword,
    updateAdminUser,
} from "@services/AdminUsers";

interface UserFormValues {
    disabled: boolean;
    displayName: string;
    email: string;
    groups: string;
    notify: boolean;
    password: string;
    username: string;
}

interface PasswordResetFormValues {
    password: string;
}

interface ConfirmDialogProps {
    actionLabel: string;
    description: string;
    loading: boolean;
    onClose: () => void;
    onConfirm: () => void;
    open: boolean;
    title: string;
}

interface UserDialogProps {
    canNotify: boolean;
    loading: boolean;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    open: boolean;
    readOnlyUsername?: boolean;
    showPassword: boolean;
    submitLabel: string;
    subtitle: string;
    title: string;
    values: UserFormValues;
    setValues: (updater: (previous: UserFormValues) => UserFormValues) => void;
}

interface PasswordResetDialogProps {
    loading: boolean;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    open: boolean;
    title: string;
    values: PasswordResetFormValues;
    setValues: (updater: (previous: PasswordResetFormValues) => PasswordResetFormValues) => void;
}

const defaultCreateValues: UserFormValues = {
    disabled: false,
    displayName: "",
    email: "",
    groups: "",
    notify: true,
    password: "",
    username: "",
};

const defaultEditValues: UserFormValues = {
    disabled: false,
    displayName: "",
    email: "",
    groups: "",
    notify: true,
    password: "",
    username: "",
};

const defaultPasswordResetValues: PasswordResetFormValues = {
    password: "",
};

const toGroupsArray = (value: string) =>
    value
        .split(",")
        .map((group) => group.trim())
        .filter((group) => group !== "");

const toGroupsValue = (groups: string[]) => groups.join(", ");

const toCreatePayload = (values: UserFormValues): AdminCreateUserPayload => ({
    disabled: values.disabled,
    display_name: values.displayName.trim(),
    email: values.email.trim(),
    groups: toGroupsArray(values.groups),
    notify: values.notify,
    password: values.password,
    username: values.username.trim(),
});

const toUpdatePayload = (values: UserFormValues): AdminUpdateUserPayload => ({
    disabled: values.disabled,
    display_name: values.displayName.trim(),
    email: values.email.trim(),
    groups: toGroupsArray(values.groups),
});

const toPasswordResetPayload = (values: PasswordResetFormValues): AdminPasswordResetPayload => ({
    password: values.password,
});

const fromUser = (user: AdminUser): UserFormValues => ({
    disabled: user.disabled,
    displayName: user.display_name,
    email: user.email,
    groups: toGroupsValue(user.groups),
    notify: user.email.trim() !== "",
    password: "",
    username: user.username,
});

const UserManagementView = () => {
    const { t: translate } = useTranslation("settings");
    const { createErrorNotification, createInfoNotification, createSuccessNotification, createWarnNotification } =
        useNotifications();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));

    const [capabilities, setCapabilities] = useState<AdminUserManagementCapabilities>();
    const [capabilitiesLoading, setCapabilitiesLoading] = useState(true);
    const [capabilitiesError, setCapabilitiesError] = useState(false);

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersError, setUsersError] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [createSubmitting, setCreateSubmitting] = useState(false);
    const [createValues, setCreateValues] = useState<UserFormValues>(defaultCreateValues);

    const [editOpen, setEditOpen] = useState(false);
    const [editLoading, setEditLoading] = useState(false);
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [editUsername, setEditUsername] = useState("");
    const [editValues, setEditValues] = useState<UserFormValues>(defaultEditValues);

    const [passwordResetOpen, setPasswordResetOpen] = useState(false);
    const [passwordResetLoading, setPasswordResetLoading] = useState(false);
    const [passwordResetSubmitting, setPasswordResetSubmitting] = useState(false);
    const [passwordResetUsername, setPasswordResetUsername] = useState("");
    const [passwordResetValues, setPasswordResetValues] = useState<PasswordResetFormValues>(defaultPasswordResetValues);

    const [toggleUsername, setToggleUsername] = useState("");
    const [toggleNextDisabled, setToggleNextDisabled] = useState(false);
    const [toggleConfirmOpen, setToggleConfirmOpen] = useState(false);
    const [toggleSubmitting, setToggleSubmitting] = useState(false);

    const isSupported = capabilities?.supported ?? false;
    const canList = capabilities?.can_list ?? false;
    const canCreate = capabilities?.can_create ?? false;
    const canUpdate = capabilities?.can_update ?? false;
    const canResetPassword = capabilities?.can_reset_password ?? false;
    const canNotify = capabilities?.can_notify ?? false;
    const hasMutatingCapabilities = canCreate || canUpdate || canResetPassword;

    const fetchCapabilities = useCallback(async () => {
        setCapabilitiesLoading(true);
        setCapabilitiesError(false);

        try {
            const result = await getAdminUserManagementCapabilities();
            setCapabilities(result);
        } catch (error) {
            console.error(error);
            setCapabilitiesError(true);
        } finally {
            setCapabilitiesLoading(false);
        }
    }, []);

    const loadUsers = useCallback(async () => {
        setUsersLoading(true);
        setUsersError(false);

        try {
            const result = await listAdminUsers(searchQuery);
            setUsers(result);
        } catch (error) {
            console.error(error);
            setUsersError(true);
        } finally {
            setUsersLoading(false);
        }
    }, [searchQuery]);

    useEffect(() => {
        fetchCapabilities().catch(console.error);
    }, [fetchCapabilities]);

    useEffect(() => {
        if (!capabilities || !capabilities.supported || !capabilities.can_list) {
            return;
        }

        const timeout = globalThis.setTimeout(() => {
            loadUsers().catch(console.error);
        }, 250);

        return () => {
            globalThis.clearTimeout(timeout);
        };
    }, [capabilities, loadUsers]);

    const handleRefresh = () => {
        if (!capabilities?.supported || !capabilities.can_list) {
            return;
        }

        loadUsers().catch(console.error);
    };

    const handleCapabilityRetry = () => {
        fetchCapabilities().catch(console.error);
    };

    const handleOpenCreate = () => {
        setCreateValues(defaultCreateValues);
        setCreateOpen(true);
    };

    const handleCloseCreate = () => {
        if (createSubmitting) {
            return;
        }

        setCreateOpen(false);
        setCreateValues(defaultCreateValues);
    };

    const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const payload = toCreatePayload(createValues);

        if (payload.username === "" || payload.display_name === "" || payload.password === "") {
            createErrorNotification(translate("Username, display name, and password are required"));

            return;
        }

        setCreateSubmitting(true);

        try {
            const response = await createAdminUser(payload);

            createSuccessNotification(translate("User created successfully"));
            handleNotificationFeedback(response, payload.email, payload.notify);
            setCreateOpen(false);
            setCreateValues(defaultCreateValues);
            handleRefresh();
        } catch (error) {
            console.error(error);
            createErrorNotification(translate("There was an issue creating the user"));
        } finally {
            setCreateSubmitting(false);
        }
    };

    const openEditDialog = async (username: string) => {
        setEditUsername(username);
        setEditOpen(true);
        setEditLoading(true);

        try {
            const user = await getAdminUser(username);
            setEditValues(fromUser(user));
        } catch (error) {
            console.error(error);
            createErrorNotification(
                translate("There was an issue retrieving the {{item}}", {
                    item: translate("user"),
                }),
            );
            setEditOpen(false);
        } finally {
            setEditLoading(false);
        }
    };

    const handleCloseEdit = () => {
        if (editSubmitting) {
            return;
        }

        setEditOpen(false);
        setEditLoading(false);
        setEditUsername("");
        setEditValues(defaultEditValues);
    };

    const handleEdit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const payload = toUpdatePayload(editValues);

        if (payload.display_name === "") {
            createErrorNotification(translate("Display name is required"));

            return;
        }

        setEditSubmitting(true);

        try {
            await updateAdminUser(editUsername, payload);
            createSuccessNotification(translate("User updated successfully"));
            handleCloseEdit();
            handleRefresh();
        } catch (error) {
            console.error(error);
            createErrorNotification(translate("There was an issue updating the user"));
        } finally {
            setEditSubmitting(false);
        }
    };

    const openPasswordResetDialog = async (username: string) => {
        setPasswordResetUsername(username);
        setPasswordResetOpen(true);
        setPasswordResetLoading(true);

        try {
            await getAdminUser(username);
            setPasswordResetValues({ password: "" });
        } catch (error) {
            console.error(error);
            createErrorNotification(
                translate("There was an issue retrieving the {{item}}", {
                    item: translate("user"),
                }),
            );
            setPasswordResetOpen(false);
        } finally {
            setPasswordResetLoading(false);
        }
    };

    const handleClosePasswordReset = () => {
        if (passwordResetSubmitting) {
            return;
        }

        setPasswordResetOpen(false);
        setPasswordResetLoading(false);
        setPasswordResetSubmitting(false);
        setPasswordResetUsername("");
        setPasswordResetValues(defaultPasswordResetValues);
    };

    const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const payload = toPasswordResetPayload(passwordResetValues);

        if (payload.password === "") {
            createErrorNotification(translate("Password is required"));

            return;
        }

        setPasswordResetSubmitting(true);

        try {
            await resetAdminUserPassword(passwordResetUsername, payload);
            createSuccessNotification(translate("Password reset successfully"));
            handleClosePasswordReset();
        } catch (error) {
            console.error(error);
            createErrorNotification(translate("There was an issue resetting the password"));
        } finally {
            setPasswordResetSubmitting(false);
        }
    };

    const openToggleDialog = (user: AdminUser) => {
        setToggleUsername(user.username);
        setToggleNextDisabled(!user.disabled);
        setToggleConfirmOpen(true);
    };

    const handleCloseToggleDialog = () => {
        if (toggleSubmitting) {
            return;
        }

        setToggleConfirmOpen(false);
        setToggleUsername("");
        setToggleNextDisabled(false);
    };

    const handleToggleUser = async () => {
        const user = users.find((candidate) => candidate.username === toggleUsername);

        if (!user) {
            handleCloseToggleDialog();
            return;
        }

        setToggleSubmitting(true);

        try {
            await updateAdminUser(toggleUsername, {
                disabled: toggleNextDisabled,
                display_name: user.display_name,
                email: user.email,
                groups: user.groups,
            });
            createSuccessNotification(
                toggleNextDisabled ? translate("User disabled successfully") : translate("User enabled successfully"),
            );
            handleCloseToggleDialog();
            handleRefresh();
        } catch (error) {
            console.error(error);
            createErrorNotification(
                toggleNextDisabled
                    ? translate("There was an issue disabling the user")
                    : translate("There was an issue enabling the user"),
            );
        } finally {
            setToggleSubmitting(false);
        }
    };

    const readOnlyNotice = isSupported && canList && !hasMutatingCapabilities;

    const currentToggleAction = toggleNextDisabled ? translate("Disable User") : translate("Enable User");

    return (
        <Fragment>
            <UserDialog
                canNotify={canNotify}
                loading={createSubmitting}
                onClose={handleCloseCreate}
                onSubmit={handleCreate}
                open={createOpen}
                showPassword={true}
                submitLabel={translate("Create User")}
                subtitle={translate("Create a user in the configured authentication backend")}
                title={translate("Create User")}
                values={createValues}
                setValues={setCreateValues}
            />

            <UserDialog
                canNotify={canNotify}
                loading={editLoading || editSubmitting}
                onClose={handleCloseEdit}
                onSubmit={handleEdit}
                open={editOpen}
                readOnlyUsername={true}
                showPassword={false}
                submitLabel={translate("Save Changes")}
                subtitle={translate("Update profile details and access state for this user")}
                title={translate("Edit User")}
                values={editValues}
                setValues={setEditValues}
            />

            <PasswordResetDialog
                loading={passwordResetLoading || passwordResetSubmitting}
                onClose={handleClosePasswordReset}
                onSubmit={handlePasswordReset}
                open={passwordResetOpen}
                title={translate("Reset Password")}
                values={passwordResetValues}
                setValues={setPasswordResetValues}
            />

            <ConfirmDialog
                actionLabel={currentToggleAction}
                description={translate(
                    toggleNextDisabled
                        ? "This will prevent the user from signing in until they are enabled again"
                        : "This will allow the user to sign in again",
                )}
                loading={toggleSubmitting}
                onClose={handleCloseToggleDialog}
                onConfirm={handleToggleUser}
                open={toggleConfirmOpen}
                title={translate("{{action}} {{username}}", {
                    action: currentToggleAction,
                    username: toggleUsername,
                })}
            />

            <Container
                sx={{
                    alignItems: "flex-start",
                    display: "flex",
                    justifyContent: "center",
                    pb: 6,
                    pt: { md: 4, xs: 2 },
                    px: { md: 3, xs: 1.5 },
                }}
            >
                <Paper
                    variant="outlined"
                    sx={{
                        borderColor: alpha(theme.palette.divider, 0.86),
                        borderRadius: 3,
                        boxShadow: `0 20px 56px ${alpha(theme.palette.common.black, 0.035)}`,
                        overflow: "hidden",
                        width: "100%",
                    }}
                >
                    <Box
                        sx={{
                            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.72)}`,
                            p: { md: 4, xs: 2.75 },
                        }}
                    >
                        <Stack spacing={1}>
                            <Typography fontWeight={600} variant="h4">
                                {translate("User Management")}
                            </Typography>
                            <Typography color="text.secondary" sx={{ maxWidth: 720 }}>
                                {translate("Manage users in the configured authentication backend")}
                            </Typography>
                        </Stack>
                    </Box>

                    <Stack spacing={2.5} sx={{ p: { md: 4, xs: 2.5 } }}>
                        {capabilitiesLoading ? (
                            <CenteredState
                                action={
                                    <CircularProgress
                                        aria-label={translate("Loading user management capabilities")}
                                        size={28}
                                    />
                                }
                                description={translate("Checking which user management features are available")}
                                title={translate("Loading User Management")}
                            />
                        ) : null}

                        {!capabilitiesLoading && capabilitiesError ? (
                            <CenteredState
                                action={
                                    <Button onClick={handleCapabilityRetry} startIcon={<Refresh />} variant="contained">
                                        {translate("Retry")}
                                    </Button>
                                }
                                description={translate(
                                    "Authelia could not load user management capabilities right now",
                                )}
                                title={translate("Unable to Load User Management")}
                            />
                        ) : null}

                        {!capabilitiesLoading && !capabilitiesError && !isSupported ? (
                            <CenteredState
                                description={translate(
                                    "The configured authentication backend does not support administrative user management",
                                )}
                                title={translate("User Management Unsupported")}
                            />
                        ) : null}

                        {!capabilitiesLoading && !capabilitiesError && isSupported ? (
                            <Fragment>
                                {readOnlyNotice ? (
                                    <Alert severity="info">
                                        {translate("User Management is currently available in read-only mode")}
                                    </Alert>
                                ) : null}

                                {!canList ? (
                                    <CenteredState
                                        description={translate(
                                            "Your backend supports user management but does not allow listing users from this interface",
                                        )}
                                        title={translate("User Listing Unavailable")}
                                    />
                                ) : (
                                    <Fragment>
                                        <Paper
                                            variant="outlined"
                                            sx={{
                                                backgroundColor: alpha(theme.palette.background.default, 0.38),
                                                borderColor: alpha(theme.palette.divider, 0.72),
                                                borderRadius: 2.5,
                                                p: { md: 2, xs: 1.5 },
                                            }}
                                        >
                                            <Stack
                                                direction={{ md: "row", xs: "column" }}
                                                spacing={1.5}
                                                sx={{
                                                    alignItems: { md: "center", xs: "stretch" },
                                                    justifyContent: "space-between",
                                                }}
                                            >
                                                <TextField
                                                    fullWidth
                                                    id="user-management-search"
                                                    label={translate("Search Users")}
                                                    size="small"
                                                    value={searchQuery}
                                                    onChange={(event) => setSearchQuery(event.target.value)}
                                                    slotProps={{
                                                        input: {
                                                            startAdornment: (
                                                                <InputAdornment position="start">
                                                                    <Search fontSize="small" />
                                                                </InputAdornment>
                                                            ),
                                                        },
                                                    }}
                                                />
                                                <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                                                    <Button
                                                        onClick={handleRefresh}
                                                        startIcon={<Refresh />}
                                                        variant="outlined"
                                                    >
                                                        {translate("Refresh")}
                                                    </Button>
                                                    {canCreate ? (
                                                        <Button
                                                            onClick={handleOpenCreate}
                                                            startIcon={<Add />}
                                                            variant="contained"
                                                        >
                                                            {translate("Create User")}
                                                        </Button>
                                                    ) : null}
                                                </Stack>
                                            </Stack>
                                        </Paper>

                                        {usersError ? (
                                            <CenteredState
                                                action={
                                                    <Button
                                                        onClick={handleRefresh}
                                                        startIcon={<Refresh />}
                                                        variant="contained"
                                                    >
                                                        {translate("Retry")}
                                                    </Button>
                                                }
                                                description={translate("Authelia could not load users right now")}
                                                title={translate("Unable to Load Users")}
                                            />
                                        ) : null}

                                        {!usersError && usersLoading ? (
                                            <CenteredState
                                                action={
                                                    <CircularProgress
                                                        aria-label={translate("Loading users")}
                                                        size={28}
                                                    />
                                                }
                                                description={translate("Fetching users for the current search")}
                                                title={translate("Loading Users")}
                                            />
                                        ) : null}

                                        {!usersError && !usersLoading && users.length === 0 ? (
                                            <CenteredState
                                                description={
                                                    searchQuery.trim() === ""
                                                        ? translate("No users have been created yet")
                                                        : translate("No users matched your search")
                                                }
                                                title={
                                                    searchQuery.trim() === ""
                                                        ? translate("No Users Yet")
                                                        : translate("No Matching Users")
                                                }
                                            />
                                        ) : null}

                                        {!usersError && !usersLoading && users.length > 0 ? (
                                            isMobile ? (
                                                <UserCards
                                                    canResetPassword={canResetPassword}
                                                    canUpdate={canUpdate}
                                                    onEdit={openEditDialog}
                                                    onResetPassword={openPasswordResetDialog}
                                                    onToggle={openToggleDialog}
                                                    translate={translate}
                                                    users={users}
                                                />
                                            ) : (
                                                <UserTable
                                                    canResetPassword={canResetPassword}
                                                    canUpdate={canUpdate}
                                                    onEdit={openEditDialog}
                                                    onResetPassword={openPasswordResetDialog}
                                                    onToggle={openToggleDialog}
                                                    translate={translate}
                                                    users={users}
                                                />
                                            )
                                        ) : null}
                                    </Fragment>
                                )}
                            </Fragment>
                        ) : null}
                    </Stack>
                </Paper>
            </Container>
        </Fragment>
    );

    function handleNotificationFeedback(
        response: AdminCreateUserResponse | undefined,
        email: string | undefined,
        notify: boolean,
    ) {
        const notification = response?.notification;

        if (!notify) {
            return;
        }

        if (!notification) {
            if (!email || email.trim() === "") {
                createInfoNotification(
                    translate("User created without an email notification because no email address is set"),
                );
            }

            return;
        }

        showNotificationStatus(notification);
    }

    function showNotificationStatus(notification: AdminCreateUserNotificationStatus) {
        if (notification.status === "sent") {
            createSuccessNotification(notification.message ?? translate("Email notification sent"));
            return;
        }

        if (notification.status === "skipped") {
            createInfoNotification(notification.message ?? translate("Email notification was skipped"));
            return;
        }

        createWarnNotification(
            notification.message ?? translate("User saved but email notification could not be sent"),
        );
    }
};

const UserDialog = ({
    canNotify,
    loading,
    onClose,
    onSubmit,
    open,
    readOnlyUsername = false,
    setValues,
    showPassword,
    submitLabel,
    subtitle,
    title,
    values,
}: UserDialogProps) => {
    const { t: translate } = useTranslation("settings");

    const groupValues = useMemo(() => toGroupsArray(values.groups), [values.groups]);
    const notificationEnabled = canNotify && values.email.trim() !== "";

    return (
        <Dialog
            fullWidth
            maxWidth="sm"
            onClose={onClose}
            open={open}
            sx={{
                "& .MuiDialog-paper": {
                    borderRadius: 3,
                },
            }}
        >
            <Box component="form" onSubmit={onSubmit}>
                <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.25} sx={{ pt: 0.5 }}>
                        <DialogContentText sx={{ mb: 0.5 }}>{subtitle}</DialogContentText>
                        <TextField
                            disabled={loading || readOnlyUsername}
                            fullWidth
                            label={translate("Username")}
                            required
                            value={values.username}
                            onChange={(event) =>
                                setValues((previous) => ({
                                    ...previous,
                                    username: event.target.value,
                                }))
                            }
                        />
                        <TextField
                            disabled={loading}
                            fullWidth
                            label={translate("Display Name")}
                            required
                            value={values.displayName}
                            onChange={(event) =>
                                setValues((previous) => ({
                                    ...previous,
                                    displayName: event.target.value,
                                }))
                            }
                        />
                        <TextField
                            disabled={loading}
                            fullWidth
                            label={translate("Email")}
                            type="email"
                            value={values.email}
                            onChange={(event) =>
                                setValues((previous) => ({
                                    ...previous,
                                    email: event.target.value,
                                }))
                            }
                        />
                        {showPassword ? (
                            <TextField
                                disabled={loading}
                                fullWidth
                                label={translate("Password")}
                                required
                                type="password"
                                value={values.password}
                                onChange={(event) =>
                                    setValues((previous) => ({
                                        ...previous,
                                        password: event.target.value,
                                    }))
                                }
                            />
                        ) : null}
                        <TextField
                            disabled={loading}
                            fullWidth
                            helperText={translate("Separate groups with commas")}
                            label={translate("Groups")}
                            value={values.groups}
                            onChange={(event) =>
                                setValues((previous) => ({
                                    ...previous,
                                    groups: event.target.value,
                                }))
                            }
                        />
                        {groupValues.length > 0 ? (
                            <Stack direction="row" flexWrap="wrap" gap={0.75}>
                                {groupValues.map((group) => (
                                    <Chip
                                        key={group}
                                        label={group}
                                        size="small"
                                        sx={{ borderRadius: 1.5 }}
                                        variant="outlined"
                                    />
                                ))}
                            </Stack>
                        ) : null}
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={values.disabled}
                                    disabled={loading}
                                    onChange={(event) =>
                                        setValues((previous) => ({
                                            ...previous,
                                            disabled: event.target.checked,
                                        }))
                                    }
                                />
                            }
                            label={translate("User disabled")}
                        />
                        {showPassword ? (
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={values.notify}
                                        disabled={loading || !notificationEnabled}
                                        onChange={(event) =>
                                            setValues((previous) => ({
                                                ...previous,
                                                notify: event.target.checked,
                                            }))
                                        }
                                    />
                                }
                                label={translate("Notify user by email")}
                            />
                        ) : null}
                        {showPassword && !notificationEnabled ? (
                            <Alert severity="info">
                                {canNotify
                                    ? translate("Add an email address to enable notification delivery")
                                    : translate("Email notifications are unavailable for this backend")}
                            </Alert>
                        ) : null}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2.25 }}>
                    <Button disabled={loading} onClick={onClose}>
                        {translate("Cancel")}
                    </Button>
                    <Button disabled={loading} type="submit" variant="contained">
                        {loading ? translate("Saving") : submitLabel}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
};

const PasswordResetDialog = ({
    loading,
    onClose,
    onSubmit,
    open,
    setValues,
    title,
    values,
}: PasswordResetDialogProps) => {
    const { t: translate } = useTranslation("settings");

    return (
        <Dialog
            fullWidth
            maxWidth="sm"
            onClose={onClose}
            open={open}
            sx={{
                "& .MuiDialog-paper": {
                    borderRadius: 3,
                },
            }}
        >
            <Box component="form" onSubmit={onSubmit}>
                <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.25} sx={{ pt: 0.5 }}>
                        <DialogContentText sx={{ mb: 0.5 }}>
                            {translate("Set a new password for this user")}
                        </DialogContentText>
                        <TextField
                            disabled={loading}
                            fullWidth
                            label={translate("New Password")}
                            required
                            type="password"
                            value={values.password}
                            onChange={(event) =>
                                setValues((previous) => ({
                                    ...previous,
                                    password: event.target.value,
                                }))
                            }
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2.25 }}>
                    <Button disabled={loading} onClick={onClose}>
                        {translate("Cancel")}
                    </Button>
                    <Button disabled={loading} type="submit" variant="contained">
                        {loading ? translate("Saving") : translate("Reset Password")}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
};

const ConfirmDialog = ({ actionLabel, description, loading, onClose, onConfirm, open, title }: ConfirmDialogProps) => {
    const { t: translate } = useTranslation("settings");

    return (
        <Dialog
            fullWidth
            maxWidth="xs"
            onClose={onClose}
            open={open}
            sx={{
                "& .MuiDialog-paper": {
                    borderRadius: 3,
                },
            }}
        >
            <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>
            <DialogContent>
                <DialogContentText>{description}</DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2.25 }}>
                <Button disabled={loading} onClick={onClose}>
                    {translate("Cancel")}
                </Button>
                <Button disabled={loading} onClick={onConfirm} variant="contained">
                    {loading ? translate("Saving") : actionLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

interface UserCollectionProps {
    canResetPassword: boolean;
    canUpdate: boolean;
    onEdit: (username: string) => void;
    onResetPassword: (username: string) => void;
    onToggle: (user: AdminUser) => void;
    translate: (key: string, values?: Record<string, string>) => string;
    users: AdminUser[];
}

const UserTable = ({
    canResetPassword,
    canUpdate,
    onEdit,
    onResetPassword,
    onToggle,
    translate,
    users,
}: UserCollectionProps) => {
    const theme = useTheme();

    return (
        <TableContainer
            component={Paper}
            variant="outlined"
            sx={{
                borderColor: alpha(theme.palette.divider, 0.72),
                borderRadius: 2.5,
                overflow: "hidden",
            }}
        >
            <Table
                sx={{
                    "& .MuiTableCell-body": {
                        borderBottomColor: alpha(theme.palette.divider, 0.5),
                        py: 1.5,
                    },
                    "& .MuiTableCell-head": {
                        backgroundColor: alpha(theme.palette.background.default, 0.44),
                        borderBottomColor: alpha(theme.palette.divider, 0.72),
                        color: "text.secondary",
                        fontSize: theme.typography.caption.fontSize,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        py: 1.25,
                        textTransform: "uppercase",
                    },
                    "& .MuiTableRow-root:last-of-type .MuiTableCell-body": {
                        borderBottom: 0,
                    },
                }}
            >
                <TableHead>
                    <TableRow>
                        <TableCell>{translate("Username")}</TableCell>
                        <TableCell>{translate("Display Name")}</TableCell>
                        <TableCell>{translate("Email")}</TableCell>
                        <TableCell>{translate("Groups")}</TableCell>
                        <TableCell>{translate("Status")}</TableCell>
                        <TableCell align="right">{translate("Actions")}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {users.map((user) => (
                        <TableRow key={user.username} hover>
                            <TableCell>{user.username}</TableCell>
                            <TableCell>{user.display_name}</TableCell>
                            <TableCell>{user.email || translate("Not Set")}</TableCell>
                            <TableCell>
                                <GroupsList groups={user.groups} translate={translate} />
                            </TableCell>
                            <TableCell>
                                <StatusChip disabled={user.disabled} translate={translate} />
                            </TableCell>
                            <TableCell align="right">
                                <RowActions
                                    canResetPassword={canResetPassword}
                                    canUpdate={canUpdate}
                                    onEdit={() => onEdit(user.username)}
                                    onResetPassword={() => onResetPassword(user.username)}
                                    onToggle={() => onToggle(user)}
                                    translate={translate}
                                    user={user}
                                />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const UserCards = ({
    canResetPassword,
    canUpdate,
    onEdit,
    onResetPassword,
    onToggle,
    translate,
    users,
}: UserCollectionProps) => (
    <Stack spacing={1.25}>
        {users.map((user) => (
            <Card
                key={user.username}
                variant="outlined"
                sx={(theme) => ({
                    borderColor: alpha(theme.palette.divider, 0.72),
                    borderRadius: 2.5,
                    boxShadow: `0 10px 28px ${alpha(theme.palette.common.black, 0.025)}`,
                })}
            >
                <CardContent sx={{ pb: 1.25 }}>
                    <Stack spacing={1.5}>
                        <Stack direction="row" justifyContent="space-between" spacing={1}>
                            <Box>
                                <Typography fontWeight={600}>{user.display_name}</Typography>
                                <Typography color="text.secondary" variant="body2">
                                    {user.username}
                                </Typography>
                            </Box>
                            <StatusChip disabled={user.disabled} translate={translate} />
                        </Stack>
                        <Typography color={user.email ? "text.primary" : "text.secondary"} variant="body2">
                            {user.email || translate("Not Set")}
                        </Typography>
                        <GroupsList groups={user.groups} translate={translate} />
                    </Stack>
                </CardContent>
                <CardActions sx={{ justifyContent: "flex-end", pb: 2, pt: 0, px: 2 }}>
                    <RowActions
                        canResetPassword={canResetPassword}
                        canUpdate={canUpdate}
                        onEdit={() => onEdit(user.username)}
                        onResetPassword={() => onResetPassword(user.username)}
                        onToggle={() => onToggle(user)}
                        translate={translate}
                        user={user}
                    />
                </CardActions>
            </Card>
        ))}
    </Stack>
);

const GroupsList = ({ groups, translate }: { groups: string[]; translate: (key: string) => string }) =>
    groups.length > 0 ? (
        <Stack direction="row" flexWrap="wrap" gap={0.75}>
            {groups.map((group) => (
                <Chip key={group} label={group} size="small" sx={{ borderRadius: 1.5 }} variant="outlined" />
            ))}
        </Stack>
    ) : (
        <Typography color="text.secondary" variant="body2">
            {translate("No Groups")}
        </Typography>
    );

const StatusChip = ({ disabled, translate }: { disabled: boolean; translate: (key: string) => string }) => (
    <Chip
        label={disabled ? translate("Disabled") : translate("Enabled")}
        size="small"
        sx={(theme) => ({
            backgroundColor: disabled
                ? alpha(theme.palette.text.secondary, 0.06)
                : alpha(theme.palette.success.main, 0.1),
            borderColor: disabled ? alpha(theme.palette.text.secondary, 0.22) : alpha(theme.palette.success.main, 0.28),
            borderRadius: 1.5,
            color: disabled ? "text.secondary" : "success.dark",
            fontWeight: 600,
        })}
        variant="outlined"
    />
);

const RowActions = ({
    canResetPassword,
    canUpdate,
    onEdit,
    onResetPassword,
    onToggle,
    translate,
    user,
}: {
    canResetPassword: boolean;
    canUpdate: boolean;
    onEdit: () => void;
    onResetPassword: () => void;
    onToggle: () => void;
    translate: (key: string) => string;
    user: AdminUser;
}) => (
    <Stack direction="row" justifyContent="flex-end" spacing={0.25}>
        {canUpdate ? (
            <Tooltip title={translate("Edit User")}>
                <IconButton
                    aria-label={`${translate("Edit User")} ${user.username}`}
                    onClick={onEdit}
                    size="small"
                    sx={{ color: "text.secondary" }}
                >
                    <Edit fontSize="small" />
                </IconButton>
            </Tooltip>
        ) : null}
        {canResetPassword ? (
            <Tooltip title={translate("Reset Password")}>
                <IconButton
                    aria-label={`${translate("Reset Password")} ${user.username}`}
                    onClick={onResetPassword}
                    size="small"
                    sx={{ color: "text.secondary" }}
                >
                    <LockReset fontSize="small" />
                </IconButton>
            </Tooltip>
        ) : null}
        {canUpdate ? (
            <Tooltip title={user.disabled ? translate("Enable User") : translate("Disable User")}>
                <IconButton
                    aria-label={`${user.disabled ? translate("Enable User") : translate("Disable User")} ${user.username}`}
                    onClick={onToggle}
                    size="small"
                    sx={{ color: "text.secondary" }}
                >
                    {user.disabled ? <Person fontSize="small" /> : <PersonOff fontSize="small" />}
                </IconButton>
            </Tooltip>
        ) : null}
    </Stack>
);

const CenteredState = ({ action, description, title }: { action?: ReactNode; description: string; title: string }) => (
    <Paper
        variant="outlined"
        sx={(theme) => ({
            alignItems: "center",
            backgroundColor: alpha(theme.palette.background.default, 0.28),
            borderColor: alpha(theme.palette.divider, 0.72),
            borderRadius: 2.5,
            display: "flex",
            justifyContent: "center",
            minHeight: 220,
            px: 3,
            py: 4,
            textAlign: "center",
        })}
    >
        <Stack spacing={1.5} sx={{ alignItems: "center", maxWidth: 420 }}>
            <Typography fontWeight={600} variant="h6">
                {title}
            </Typography>
            <Typography color="text.secondary">{description}</Typography>
            {action}
        </Stack>
    </Paper>
);

export default UserManagementView;
