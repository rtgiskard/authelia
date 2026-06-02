import {
    type ChangeEvent,
    type FormEvent,
    Fragment,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";

import { Add, Delete, Edit, LockReset, Person, PersonOff, Refresh, Search } from "@mui/icons-material";
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
    TablePagination,
    TableRow,
    TableSortLabel,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import axios from "axios";
import { useTranslation } from "react-i18next";

import PasswordMeter from "@components/PasswordMeter";
import { useNotifications } from "@contexts/NotificationsContext";
import { useUserInfoGET } from "@hooks/UserInfo";
import { type PasswordPolicyConfiguration, PasswordPolicyMode } from "@models/PasswordPolicy";
import {
    type AdminCreateUserNotificationStatus,
    type AdminCreateUserPayload,
    type AdminCreateUserResponse,
    type AdminPasswordResetPayload,
    type AdminUpdateUserPayload,
    type AdminUser,
    type AdminUserManagementCapabilities,
    createAdminUser,
    deleteAdminUser,
    getAdminUser,
    getAdminUserManagementCapabilities,
    listAdminUsers,
    resetAdminUserPassword,
    updateAdminUser,
} from "@services/AdminUsers";
import { getPasswordPolicyConfiguration } from "@services/PasswordPolicyConfiguration";
import { type UserSessionElevation, getUserSessionElevation } from "@services/UserSessionElevation";
import IdentityVerificationDialog from "@views/Settings/Common/IdentityVerificationDialog";
import SecondFactorDialog from "@views/Settings/Common/SecondFactorDialog";

interface UserFormValues {
    disabled: boolean;
    displayName: string;
    email: string;
    generatePassword: boolean;
    groups: string;
    notify: boolean;
    password: string;
    username: string;
}

interface PasswordResetFormValues {
    generatePassword: boolean;
    password: string;
}

interface PasswordResetUserDetails {
    displayName: string;
    email: string;
}

interface FieldErrors {
    email: boolean;
    password: boolean;
    username: boolean;
}

interface FieldHelperText {
    email?: string;
    username?: string;
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
    errors: FieldErrors;
    helperText?: FieldHelperText;
    loading: boolean;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    open: boolean;
    passwordPolicy: PasswordPolicyConfiguration;
    readOnlyUsername?: boolean;
    showPassword: boolean;
    submitLabel: string;
    subtitle: string;
    title: string;
    values: UserFormValues;
    setValues: (updater: (previous: UserFormValues) => UserFormValues) => void;
}

interface PasswordResetDialogProps {
    canNotify: boolean;
    errors: Pick<FieldErrors, "password">;
    loading: boolean;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    open: boolean;
    passwordPolicy: PasswordPolicyConfiguration;
    selectedUser: PasswordResetUserDetails;
    title: string;
    values: PasswordResetFormValues;
    setValues: (updater: (previous: PasswordResetFormValues) => PasswordResetFormValues) => void;
}

const defaultCreateValues: UserFormValues = {
    disabled: false,
    displayName: "",
    email: "",
    generatePassword: false,
    groups: "",
    notify: true,
    password: "",
    username: "",
};

const defaultEditValues: UserFormValues = {
    disabled: false,
    displayName: "",
    email: "",
    generatePassword: false,
    groups: "",
    notify: true,
    password: "",
    username: "",
};

const defaultPasswordResetValues: PasswordResetFormValues = {
    generatePassword: false,
    password: "",
};

const defaultPasswordResetUserDetails: PasswordResetUserDetails = {
    displayName: "",
    email: "",
};

const defaultFieldErrors: FieldErrors = {
    email: false,
    password: false,
    username: false,
};

const defaultPasswordPolicy: PasswordPolicyConfiguration = {
    max_length: 0,
    min_length: 8,
    min_score: 0,
    mode: PasswordPolicyMode.Disabled,
    require_lowercase: false,
    require_number: false,
    require_special: false,
    require_uppercase: false,
};

const rowsPerPageOptions = [10, 20, 40, 60];

type StatusSortDirection = "asc" | "desc";

const toGroupsArray = (value: string) =>
    value
        .split(",")
        .map((group) => group.trim())
        .filter((group) => group !== "");

const toGroupsValue = (groups: string[]) => groups.join(", ");

const toCreatePayload = (values: UserFormValues): AdminCreateUserPayload => {
    const payload: AdminCreateUserPayload = {
        disabled: values.disabled,
        display_name: values.displayName.trim(),
        email: values.email.trim(),
        groups: toGroupsArray(values.groups),
        notify: values.generatePassword ? true : values.notify,
        username: values.username.trim(),
    };

    if (values.generatePassword) {
        payload.generate_password = true;
    } else {
        payload.password = values.password;
    }

    return payload;
};

const toUpdatePayload = (values: UserFormValues): AdminUpdateUserPayload => ({
    disabled: values.disabled,
    display_name: values.displayName.trim(),
    email: values.email.trim(),
    groups: toGroupsArray(values.groups),
});

const toPasswordResetPayload = (values: PasswordResetFormValues): AdminPasswordResetPayload =>
    values.generatePassword
        ? {
              generate_password: true,
              notify: true,
          }
        : {
              password: values.password,
          };

const isElevationSatisfied = (elevation?: UserSessionElevation) =>
    elevation ? elevation.elevated || elevation.skip_second_factor : false;

const fromUser = (user: AdminUser): UserFormValues => ({
    disabled: user.disabled,
    displayName: user.display_name,
    email: user.email,
    generatePassword: false,
    groups: toGroupsValue(user.groups),
    notify: user.email.trim() !== "",
    password: "",
    username: user.username,
});

const identityEquals = (a: string, b: string) =>
    a.trim().localeCompare(b.trim(), undefined, { sensitivity: "accent" }) === 0;

const hasUsernameConflict = (users: AdminUser[], username: string) =>
    username.trim() !== "" &&
    users.some((user) => identityEquals(user.username, username) || identityEquals(user.email, username));

const hasEmailConflict = (users: AdminUser[], email: string, currentUsername = "") =>
    email.trim() !== "" &&
    users.some(
        (user) =>
            !identityEquals(user.username, currentUsername) &&
            (identityEquals(user.email, email) || identityEquals(user.username, email)),
    );

const UserManagementView = () => {
    const { t: translate } = useTranslation("settings");
    const { createErrorNotification, createInfoNotification, createSuccessNotification, createWarnNotification } =
        useNotifications();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));

    const [userInfo, fetchUserInfo, , fetchUserInfoError] = useUserInfoGET();

    const [capabilities, setCapabilities] = useState<AdminUserManagementCapabilities>();
    const [capabilitiesLoading, setCapabilitiesLoading] = useState(true);
    const [capabilitiesError, setCapabilitiesError] = useState(false);
    const [capabilitiesInitialized, setCapabilitiesInitialized] = useState(false);
    const [elevation, setElevation] = useState<UserSessionElevation>();
    const [elevationCancelled, setElevationCancelled] = useState(false);
    const [dialogSFOpening, setDialogSFOpening] = useState(false);
    const [dialogIVOpening, setDialogIVOpening] = useState(false);

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [identityUsers, setIdentityUsers] = useState<AdminUser[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersError, setUsersError] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [createSubmitting, setCreateSubmitting] = useState(false);
    const [createValues, setCreateValues] = useState<UserFormValues>(defaultCreateValues);
    const [createErrors, setCreateErrors] = useState<FieldErrors>(defaultFieldErrors);

    const [editOpen, setEditOpen] = useState(false);
    const [editLoading, setEditLoading] = useState(false);
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [editUsername, setEditUsername] = useState("");
    const [editValues, setEditValues] = useState<UserFormValues>(defaultEditValues);
    const [editErrors, setEditErrors] = useState<FieldErrors>(defaultFieldErrors);

    const [passwordResetOpen, setPasswordResetOpen] = useState(false);
    const [passwordResetLoading, setPasswordResetLoading] = useState(false);
    const [passwordResetSubmitting, setPasswordResetSubmitting] = useState(false);
    const [passwordResetUsername, setPasswordResetUsername] = useState("");
    const [passwordResetUserDetails, setPasswordResetUserDetails] = useState<PasswordResetUserDetails>(
        defaultPasswordResetUserDetails,
    );
    const [passwordResetValues, setPasswordResetValues] = useState<PasswordResetFormValues>(defaultPasswordResetValues);
    const [passwordResetErrors, setPasswordResetErrors] = useState<Pick<FieldErrors, "password">>({ password: false });

    const [toggleUsername, setToggleUsername] = useState("");
    const [toggleNextDisabled, setToggleNextDisabled] = useState(false);
    const [toggleConfirmOpen, setToggleConfirmOpen] = useState(false);
    const [toggleSubmitting, setToggleSubmitting] = useState(false);

    const [deleteUsername, setDeleteUsername] = useState("");
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicyConfiguration>(defaultPasswordPolicy);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(20);
    const [statusSortDirection, setStatusSortDirection] = useState<StatusSortDirection>("asc");

    const isSupported = capabilities?.supported ?? false;
    const canList = capabilities?.can_list ?? false;
    const canCreate = capabilities?.can_create ?? false;
    const canDelete = capabilities?.can_delete ?? false;
    const canUpdate = capabilities?.can_update ?? false;
    const canResetPassword = capabilities?.can_reset_password ?? false;
    const canNotify = capabilities?.can_notify ?? false;
    const hasMutatingCapabilities = canCreate || canDelete || canUpdate || canResetPassword;
    const verificationOpening =
        !capabilitiesInitialized && !capabilitiesLoading && !capabilitiesError && !elevationCancelled;
    const sortedUsers = useMemo(() => {
        const nextUsers = [...users];
        nextUsers.sort((a, b) => {
            if (a.disabled === b.disabled) {
                return a.username.localeCompare(b.username);
            }

            const result = a.disabled ? 1 : -1;

            return statusSortDirection === "asc" ? result : -result;
        });

        return nextUsers;
    }, [statusSortDirection, users]);
    const pagedUsers = useMemo(
        () => sortedUsers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
        [page, rowsPerPage, sortedUsers],
    );

    const createHelperText = useMemo(
        () => ({
            email: hasEmailConflict(identityUsers, createValues.email)
                ? translate("Email is already in use")
                : undefined,
            username: hasUsernameConflict(identityUsers, createValues.username)
                ? translate("Username is already in use")
                : undefined,
        }),
        [createValues.email, createValues.username, identityUsers, translate],
    );
    const editHelperText = useMemo(
        () => ({
            email: hasEmailConflict(identityUsers, editValues.email, editUsername)
                ? translate("Email is already in use")
                : undefined,
        }),
        [editUsername, editValues.email, identityUsers, translate],
    );

    const fetchCapabilities = useCallback(async () => {
        setCapabilitiesLoading(true);
        setCapabilitiesError(false);

        try {
            const result = await getAdminUserManagementCapabilities();
            setCapabilities(result);
            setCapabilitiesInitialized(true);
        } catch (error) {
            console.error(error);
            setCapabilitiesError(true);
            setCapabilitiesInitialized(true);
        } finally {
            setCapabilitiesLoading(false);
        }
    }, []);

    const handleResetStateOpening = useCallback(() => {
        setDialogSFOpening(false);
        setDialogIVOpening(false);
    }, []);

    const handleResetState = useCallback(() => {
        handleResetStateOpening();

        setElevation(undefined);
        setCapabilities(undefined);
        setCapabilitiesLoading(false);
        setCapabilitiesError(false);
        setCapabilitiesInitialized(false);
        setElevationCancelled(false);
    }, [handleResetStateOpening]);

    const handleElevationCancelled = useCallback(() => {
        handleResetStateOpening();

        setElevation(undefined);
        setCapabilities(undefined);
        setCapabilitiesLoading(false);
        setCapabilitiesError(false);
        setCapabilitiesInitialized(false);
        setElevationCancelled(true);
    }, [handleResetStateOpening]);

    const handleElevationRefresh = useCallback(async () => {
        const result = await getUserSessionElevation();
        setElevation(result);

        return result;
    }, []);

    const handleSFDialogOpened = useCallback(() => {
        setDialogSFOpening(false);
    }, []);

    const handleIVDialogOpened = useCallback(() => {
        setDialogIVOpening(false);
    }, []);

    const handleLoadCapabilities = useCallback(async () => {
        setCapabilitiesLoading(true);
        setCapabilitiesError(false);
        setCapabilitiesInitialized(false);
        setElevationCancelled(false);

        try {
            const elevationResult = await getUserSessionElevation();
            setElevation(elevationResult);

            if (isElevationSatisfied(elevationResult)) {
                await fetchCapabilities();
                return;
            }

            setCapabilitiesLoading(false);
            setElevationCancelled(true);
        } catch (error) {
            console.error(error);
            setCapabilitiesLoading(false);
            setCapabilitiesError(true);
            setCapabilitiesInitialized(true);
        }
    }, [fetchCapabilities]);

    const handleStartElevation = useCallback(async () => {
        setCapabilitiesLoading(true);
        setCapabilitiesError(false);
        setCapabilitiesInitialized(false);
        setElevationCancelled(false);

        try {
            const elevationResult = await getUserSessionElevation();
            setElevation(elevationResult);

            if (isElevationSatisfied(elevationResult)) {
                await fetchCapabilities();
                return;
            }

            setCapabilitiesLoading(false);
            setDialogSFOpening(true);
        } catch (error) {
            console.error(error);
            setCapabilitiesLoading(false);
            setCapabilitiesError(true);
            setCapabilitiesInitialized(true);
        }
    }, [fetchCapabilities]);

    const handleSFDialogClosed = useCallback(
        (ok: boolean, _changed: boolean) => {
            if (!ok) {
                console.warn("Second Factor dialog close callback failed, it was likely cancelled by the user.");

                handleElevationCancelled();

                return;
            }

            setCapabilitiesLoading(true);

            handleElevationRefresh()
                .then((refreshedElevation) => {
                    setDialogSFOpening(false);

                    if (refreshedElevation && (refreshedElevation.elevated || refreshedElevation.skip_second_factor)) {
                        fetchCapabilities().catch(console.error);

                        return;
                    }

                    setCapabilitiesLoading(false);
                    setDialogIVOpening(true);
                })
                .catch((error) => {
                    console.error(error);
                    handleResetState();
                });
        },
        [fetchCapabilities, handleElevationCancelled, handleElevationRefresh, handleResetState],
    );

    const handleIVDialogClosed = useCallback(
        (ok: boolean) => {
            if (!ok) {
                console.warn(
                    "Identity Verification dialog close callback failed, it was likely cancelled by the user.",
                );

                handleElevationCancelled();

                return;
            }

            setDialogIVOpening(false);
            setElevation(undefined);
            fetchCapabilities().catch(console.error);
        },
        [fetchCapabilities, handleElevationCancelled],
    );

    const loadUsers = useCallback(async () => {
        setUsersLoading(true);
        setUsersError(false);

        try {
            const result = await listAdminUsers(searchQuery);
            setUsers(result);
            if (searchQuery.trim() === "") {
                setIdentityUsers(result);
            }
            setPage(0);
        } catch (error) {
            console.error(error);
            setUsersError(true);
        } finally {
            setUsersLoading(false);
        }
    }, [searchQuery]);

    useEffect(() => {
        handleLoadCapabilities().catch(console.error);
    }, [handleLoadCapabilities]);

    useEffect(() => {
        getPasswordPolicyConfiguration()
            .then(setPasswordPolicy)
            .catch((error) => {
                console.error(error);
                createErrorNotification(translate("There was an issue retrieving configuration"));
            });
    }, [createErrorNotification, translate]);

    useEffect(() => {
        fetchUserInfo();
    }, [fetchUserInfo]);

    useEffect(() => {
        if (fetchUserInfoError) {
            createErrorNotification(
                translate("There was an issue retrieving user preferences", {
                    ns: "portal",
                }),
            );
        }
    }, [createErrorNotification, fetchUserInfoError, translate]);

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

        setPage(0);
        loadUsers().catch(console.error);
    };

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setPage(0);
    };

    const handleChangePage = (_event: unknown, nextPage: number) => {
        setPage(nextPage);
    };

    const handleChangeRowsPerPage = (event: ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(Number.parseInt(event.target.value, 10));
        setPage(0);
    };

    const handleCapabilityRetry = () => {
        handleStartElevation().catch(console.error);
    };

    const handleOpenCreate = () => {
        setCreateValues(defaultCreateValues);
        setCreateErrors(defaultFieldErrors);
        setCreateOpen(true);
        listAdminUsers("").then(setIdentityUsers).catch(console.error);
    };

    const handleCloseCreate = () => {
        if (createSubmitting) {
            return;
        }

        setCreateOpen(false);
        setCreateValues(defaultCreateValues);
        setCreateErrors(defaultFieldErrors);
    };

    const isWeakPasswordError = (error: unknown) => axios.isAxiosError(error) && error.response?.status === 400;

    const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const payload = toCreatePayload(createValues);
        const nextErrors = {
            email: payload.email === "",
            password: !payload.generate_password && (payload.password ?? "") === "",
            username: payload.username === "",
        };
        const usernameConflict = hasUsernameConflict(identityUsers, payload.username);
        const emailConflict = hasEmailConflict(identityUsers, payload.email);

        setCreateErrors({
            ...nextErrors,
            email: nextErrors.email || emailConflict,
            username: nextErrors.username || usernameConflict,
        });

        if (
            payload.username === "" ||
            payload.display_name === "" ||
            nextErrors.email ||
            nextErrors.password ||
            usernameConflict ||
            emailConflict
        ) {
            let message = translate("Username, display name, and password are required");
            if (nextErrors.email) {
                message = translate("Email is required");
            } else if (usernameConflict) {
                message = translate("Username is already in use");
            } else if (emailConflict) {
                message = translate("Email is already in use");
            }

            createErrorNotification(message);

            return;
        }

        setCreateSubmitting(true);

        try {
            const response = await createAdminUser(payload);

            createSuccessNotification(translate("User created successfully"));
            handleNotificationFeedback(response, payload.email, payload.notify);
            setCreateOpen(false);
            setCreateValues(defaultCreateValues);
            setCreateErrors(defaultFieldErrors);
            handleRefresh();
        } catch (error) {
            console.error(error);
            if (!payload.generate_password && isWeakPasswordError(error)) {
                setCreateErrors((previous) => ({ ...previous, password: true }));
                createErrorNotification(
                    translate("Your supplied password does not meet the password policy requirements"),
                );
            } else {
                createErrorNotification(translate("There was an issue creating the user"));
            }
        } finally {
            setCreateSubmitting(false);
        }
    };

    const openEditDialog = async (username: string) => {
        setEditUsername(username);
        setEditOpen(true);
        setEditLoading(true);
        setEditErrors(defaultFieldErrors);
        listAdminUsers("").then(setIdentityUsers).catch(console.error);

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
        setEditErrors(defaultFieldErrors);
    };

    const handleEdit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const payload = toUpdatePayload(editValues);
        const emailMissing = payload.email === "";
        const emailConflict = hasEmailConflict(identityUsers, payload.email, editUsername);

        setEditErrors({
            email: emailMissing || emailConflict,
            password: false,
            username: false,
        });

        if (payload.display_name === "") {
            createErrorNotification(translate("Display name is required"));

            return;
        }

        if (emailMissing || emailConflict) {
            createErrorNotification(
                emailMissing ? translate("Email is required") : translate("Email is already in use"),
            );

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
        setPasswordResetErrors({ password: false });

        try {
            const user = await getAdminUser(username);
            setPasswordResetUserDetails({
                displayName: user.display_name,
                email: user.email,
            });
            setPasswordResetValues(defaultPasswordResetValues);
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
        setPasswordResetUserDetails(defaultPasswordResetUserDetails);
        setPasswordResetValues(defaultPasswordResetValues);
        setPasswordResetErrors({ password: false });
    };

    const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const payload = toPasswordResetPayload(passwordResetValues);
        const passwordMissing = !payload.generate_password && (payload.password ?? "") === "";

        setPasswordResetErrors({ password: passwordMissing });

        if (payload.generate_password && (!canNotify || passwordResetUserDetails.email.trim() === "")) {
            createErrorNotification(translate("Email notification is unavailable for this user"));

            return;
        }

        if (passwordMissing) {
            createErrorNotification(translate("Password is required"));

            return;
        }

        setPasswordResetSubmitting(true);

        try {
            const response = await resetAdminUserPassword(passwordResetUsername, payload);
            createSuccessNotification(translate("Password reset successfully"));
            handleNotificationFeedback(response, passwordResetUserDetails.email, payload.notify ?? false);
            handleClosePasswordReset();
        } catch (error) {
            console.error(error);
            if (!payload.generate_password && isWeakPasswordError(error)) {
                setPasswordResetErrors({ password: true });
                createErrorNotification(
                    translate("Your supplied password does not meet the password policy requirements"),
                );
            } else {
                createErrorNotification(translate("There was an issue resetting the password"));
            }
        } finally {
            setPasswordResetSubmitting(false);
        }
    };

    const openToggleDialog = (user: AdminUser) => {
        setToggleUsername(user.username);
        setToggleNextDisabled(!user.disabled);
        setToggleConfirmOpen(true);
    };

    const handleStatusSort = () => {
        setStatusSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
        setPage(0);
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

    const openDeleteDialog = (user: AdminUser) => {
        setDeleteUsername(user.username);
        setDeleteConfirmOpen(true);
    };

    const handleCloseDeleteDialog = () => {
        if (deleteSubmitting) {
            return;
        }

        setDeleteConfirmOpen(false);
        setDeleteUsername("");
    };

    const handleDeleteUser = async () => {
        setDeleteSubmitting(true);

        try {
            await deleteAdminUser(deleteUsername);
            createSuccessNotification(translate("User deleted successfully"));
            setDeleteConfirmOpen(false);
            setDeleteUsername("");
            handleRefresh();
        } catch (error) {
            console.error(error);
            createErrorNotification(translate("There was an issue deleting the user"));
        } finally {
            setDeleteSubmitting(false);
        }
    };

    const readOnlyNotice = isSupported && canList && !hasMutatingCapabilities;

    const currentToggleAction = toggleNextDisabled ? translate("Disable User") : translate("Enable User");

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
                elevation={elevation}
                opening={dialogIVOpening}
                handleClosed={handleIVDialogClosed}
                handleOpened={handleIVDialogOpened}
            />

            <UserDialog
                canNotify={canNotify}
                errors={createErrors}
                helperText={createHelperText}
                loading={createSubmitting}
                onClose={handleCloseCreate}
                onSubmit={handleCreate}
                open={createOpen}
                passwordPolicy={passwordPolicy}
                showPassword={true}
                submitLabel={translate("Create User")}
                subtitle={translate("Create a user in the configured authentication backend")}
                title={translate("Create User")}
                values={createValues}
                setValues={setCreateValues}
            />

            <UserDialog
                canNotify={canNotify}
                errors={editErrors}
                helperText={editHelperText}
                loading={editLoading || editSubmitting}
                onClose={handleCloseEdit}
                onSubmit={handleEdit}
                open={editOpen}
                passwordPolicy={passwordPolicy}
                readOnlyUsername={true}
                showPassword={false}
                submitLabel={translate("Save Changes")}
                subtitle={translate("Update profile details and access state for this user")}
                title={translate("Edit User")}
                values={editValues}
                setValues={setEditValues}
            />

            <PasswordResetDialog
                canNotify={canNotify}
                errors={passwordResetErrors}
                loading={passwordResetLoading || passwordResetSubmitting}
                onClose={handleClosePasswordReset}
                onSubmit={handlePasswordReset}
                open={passwordResetOpen}
                passwordPolicy={passwordPolicy}
                selectedUser={passwordResetUserDetails}
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

            <ConfirmDialog
                actionLabel={translate("Delete User")}
                description={translate(
                    "This permanently deletes the user from the configured authentication backend and cannot be undone",
                )}
                loading={deleteSubmitting}
                onClose={handleCloseDeleteDialog}
                onConfirm={handleDeleteUser}
                open={deleteConfirmOpen}
                title={translate("Delete {{username}}", {
                    username: deleteUsername,
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
                        borderColor: alpha(theme.palette.divider, 0.32),
                        borderRadius: 3,
                        boxShadow: `0 20px 56px ${alpha(theme.palette.common.black, 0.035)}`,
                        overflow: "hidden",
                        width: "100%",
                    }}
                >
                    <Box
                        sx={{
                            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.28)}`,
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

                        {verificationOpening ? (
                            <CenteredState
                                description={translate(
                                    "In order to perform this action, policy enforcement requires that two-factor authentication is performed",
                                )}
                                title={translate("Verification")}
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

                        {!capabilitiesLoading && !capabilitiesError && elevationCancelled ? (
                            <CenteredState
                                action={
                                    <Button onClick={handleCapabilityRetry} startIcon={<Refresh />} variant="contained">
                                        {translate("Verify")}
                                    </Button>
                                }
                                description={translate(
                                    "In order to perform this action, policy enforcement requires that two-factor authentication is performed",
                                )}
                                title={translate("Verification")}
                            />
                        ) : null}

                        {!capabilitiesInitialized ? null : !capabilitiesLoading &&
                          !capabilitiesError &&
                          !isSupported ? (
                            <CenteredState
                                description={translate(
                                    "The configured authentication backend does not support administrative user management",
                                )}
                                title={translate("User Management Unsupported")}
                            />
                        ) : null}

                        {!capabilitiesInitialized ? null : !capabilitiesLoading && !capabilitiesError && isSupported ? (
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
                                                borderColor: alpha(theme.palette.divider, 0.28),
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
                                                    sx={{
                                                        flexBasis: { md: 420 },
                                                        flexGrow: { md: 0 },
                                                        maxWidth: { md: 520 },
                                                    }}
                                                    value={searchQuery}
                                                    onChange={(event) => handleSearchChange(event.target.value)}
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
                                                <Stack
                                                    direction="row"
                                                    spacing={1}
                                                    sx={{
                                                        flexShrink: 0,
                                                        justifyContent: "flex-end",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    <Button
                                                        onClick={handleRefresh}
                                                        startIcon={<Refresh />}
                                                        sx={{ minWidth: 112 }}
                                                        variant="outlined"
                                                    >
                                                        {translate("Refresh")}
                                                    </Button>
                                                    {canCreate ? (
                                                        <Button
                                                            onClick={handleOpenCreate}
                                                            startIcon={<Add />}
                                                            sx={{ minWidth: 144 }}
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
                                            <Fragment>
                                                {isMobile ? (
                                                    <UserCards
                                                        canDelete={canDelete}
                                                        canResetPassword={canResetPassword}
                                                        canUpdate={canUpdate}
                                                        onDelete={openDeleteDialog}
                                                        onEdit={openEditDialog}
                                                        onResetPassword={openPasswordResetDialog}
                                                        onToggle={openToggleDialog}
                                                        translate={translate}
                                                        users={pagedUsers}
                                                    />
                                                ) : (
                                                    <UserTable
                                                        canDelete={canDelete}
                                                        canResetPassword={canResetPassword}
                                                        canUpdate={canUpdate}
                                                        onDelete={openDeleteDialog}
                                                        onEdit={openEditDialog}
                                                        onResetPassword={openPasswordResetDialog}
                                                        onStatusSort={handleStatusSort}
                                                        onToggle={openToggleDialog}
                                                        statusSortDirection={statusSortDirection}
                                                        translate={translate}
                                                        users={pagedUsers}
                                                    />
                                                )}
                                                <TablePagination
                                                    component="div"
                                                    count={users.length}
                                                    labelRowsPerPage={translate("Rows per page")}
                                                    onPageChange={handleChangePage}
                                                    onRowsPerPageChange={handleChangeRowsPerPage}
                                                    page={page}
                                                    rowsPerPage={rowsPerPage}
                                                    rowsPerPageOptions={rowsPerPageOptions}
                                                />
                                            </Fragment>
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
    errors,
    helperText = {},
    loading,
    onClose,
    onSubmit,
    open,
    passwordPolicy,
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
    const generatingPassword = showPassword && values.generatePassword;
    const passwordPolicyEnabled = passwordPolicy.mode !== PasswordPolicyMode.Disabled;

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
            <Box component="form" noValidate onSubmit={onSubmit}>
                <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.25} sx={{ pt: 0.5 }}>
                        <DialogContentText sx={{ mb: 0.5 }}>{subtitle}</DialogContentText>
                        <TextField
                            disabled={loading || readOnlyUsername}
                            error={errors.username || Boolean(helperText.username)}
                            fullWidth
                            helperText={helperText.username}
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
                            error={errors.email || Boolean(helperText.email)}
                            fullWidth
                            helperText={helperText.email}
                            label={translate("Email")}
                            required
                            type="email"
                            value={values.email}
                            onChange={(event) =>
                                setValues((previous) => ({
                                    ...previous,
                                    email: event.target.value,
                                    generatePassword:
                                        event.target.value.trim() === "" ? false : previous.generatePassword,
                                    notify: previous.generatePassword || previous.notify,
                                }))
                            }
                        />
                        {showPassword && canNotify ? (
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={values.generatePassword}
                                        disabled={loading || values.email.trim() === ""}
                                        onChange={(event) =>
                                            setValues((previous) => ({
                                                ...previous,
                                                generatePassword: event.target.checked,
                                                notify: event.target.checked ? true : previous.notify,
                                                password: event.target.checked ? "" : previous.password,
                                            }))
                                        }
                                    />
                                }
                                label={translate("Generate random password and email it to the user")}
                            />
                        ) : null}
                        {showPassword && !generatingPassword ? (
                            <Box>
                                <TextField
                                    disabled={loading}
                                    error={errors.password}
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
                                {passwordPolicyEnabled ? (
                                    <PasswordMeter value={values.password} policy={passwordPolicy} />
                                ) : null}
                            </Box>
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
                                        disabled={loading || !notificationEnabled || values.generatePassword}
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
    canNotify,
    errors,
    loading,
    onClose,
    onSubmit,
    open,
    passwordPolicy,
    selectedUser,
    setValues,
    title,
    values,
}: PasswordResetDialogProps) => {
    const { t: translate } = useTranslation("settings");
    const canGeneratePassword = canNotify && selectedUser.email.trim() !== "";
    const passwordPolicyEnabled = passwordPolicy.mode !== PasswordPolicyMode.Disabled;

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
            <Box component="form" noValidate onSubmit={onSubmit}>
                <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.25} sx={{ pt: 0.5 }}>
                        <DialogContentText sx={{ mb: 0.5 }}>
                            {translate("Set a new password for this user")}
                        </DialogContentText>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={values.generatePassword}
                                    disabled={loading || !canGeneratePassword}
                                    onChange={(event) =>
                                        setValues((previous) => ({
                                            ...previous,
                                            generatePassword: event.target.checked,
                                            password: event.target.checked ? "" : previous.password,
                                        }))
                                    }
                                />
                            }
                            label={translate("Generate random password and email it to the user")}
                        />
                        {!canGeneratePassword ? (
                            <Alert severity="info">
                                {canNotify
                                    ? translate("Email notification is unavailable for this user")
                                    : translate("Email notifications are unavailable for this backend")}
                            </Alert>
                        ) : null}
                        {!values.generatePassword ? (
                            <Box>
                                <TextField
                                    disabled={loading}
                                    error={errors.password}
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
                                {passwordPolicyEnabled ? (
                                    <PasswordMeter value={values.password} policy={passwordPolicy} />
                                ) : null}
                            </Box>
                        ) : null}
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
    canDelete: boolean;
    canResetPassword: boolean;
    canUpdate: boolean;
    onDelete: (user: AdminUser) => void;
    onEdit: (username: string) => void;
    onResetPassword: (username: string) => void;
    onToggle: (user: AdminUser) => void;
    translate: (key: string, values?: Record<string, string>) => string;
    users: AdminUser[];
}

interface UserTableProps extends UserCollectionProps {
    onStatusSort: () => void;
    statusSortDirection: StatusSortDirection;
}

const UserTable = ({
    canDelete,
    canResetPassword,
    canUpdate,
    onDelete,
    onEdit,
    onResetPassword,
    onStatusSort,
    onToggle,
    statusSortDirection,
    translate,
    users,
}: UserTableProps) => {
    const theme = useTheme();

    return (
        <TableContainer
            component={Paper}
            variant="outlined"
            sx={{
                borderColor: alpha(theme.palette.divider, 0.32),
                borderRadius: 2.5,
                overflow: "hidden",
            }}
        >
            <Table
                sx={{
                    "& .MuiTableCell-body": {
                        borderBottomColor: alpha(theme.palette.divider, 0.28),
                        py: 1.5,
                    },
                    "& .MuiTableCell-head": {
                        backgroundColor: alpha(theme.palette.background.default, 0.44),
                        borderBottomColor: alpha(theme.palette.divider, 0.32),
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
                        <TableCell>
                            <TableSortLabel active direction={statusSortDirection} onClick={onStatusSort}>
                                {translate("Status")}
                            </TableSortLabel>
                        </TableCell>
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
                                    canDelete={canDelete}
                                    canResetPassword={canResetPassword}
                                    canUpdate={canUpdate}
                                    onDelete={() => onDelete(user)}
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
    canDelete,
    canResetPassword,
    canUpdate,
    onDelete,
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
                    borderColor: alpha(theme.palette.divider, 0.32),
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
                        canDelete={canDelete}
                        canResetPassword={canResetPassword}
                        canUpdate={canUpdate}
                        onDelete={() => onDelete(user)}
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
    canDelete,
    canResetPassword,
    canUpdate,
    onDelete,
    onEdit,
    onResetPassword,
    onToggle,
    translate,
    user,
}: {
    canDelete: boolean;
    canResetPassword: boolean;
    canUpdate: boolean;
    onDelete: () => void;
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
        {canDelete ? (
            <Tooltip title={translate("Delete User")}>
                <IconButton
                    aria-label={`${translate("Delete User")} ${user.username}`}
                    onClick={onDelete}
                    size="small"
                    sx={{ color: "text.secondary" }}
                >
                    <Delete fontSize="small" />
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
            borderColor: alpha(theme.palette.divider, 0.28),
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
