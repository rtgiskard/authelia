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

import axios from "axios";
import {
    ChevronLeft,
    ChevronRight,
    KeyRound,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    UserRound,
    UserRoundX,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import PasswordMeter from "@components/PasswordMeter";
import { Alert, AlertDescription } from "@components/UI/Alert";
import { Button } from "@components/UI/Button";
import { Card, CardContent, CardFooter } from "@components/UI/Card";
import { Checkbox } from "@components/UI/Checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@components/UI/Dialog";
import { Input } from "@components/UI/Input";
import { Label } from "@components/UI/Label";
import { Spinner } from "@components/UI/Spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@components/UI/Tooltip";
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
    const [isMobile, setIsMobile] = useState(() => globalThis.matchMedia("(max-width: 899px)").matches);

    useEffect(() => {
        const media = globalThis.matchMedia("(max-width: 899px)");
        const update = () => setIsMobile(media.matches);

        media.addEventListener?.("change", update);

        return () => media.removeEventListener?.("change", update);
    }, []);

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

    const handleChangeRowsPerPage = (event: ChangeEvent<HTMLSelectElement>) => {
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
        const email = payload.email ?? "";
        const emailMissing = email === "";
        const emailConflict = hasEmailConflict(identityUsers, email, editUsername);

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
            await updateAdminUser(toggleUsername, { disabled: toggleNextDisabled });
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

            <div className="flex w-full items-start justify-center px-3 pt-4 pb-12 md:px-6 md:pt-8">
                <div className="w-full overflow-hidden rounded-xl border bg-card shadow-sm">
                    <header className="border-b p-6 md:p-8">
                        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                            {translate("User Management")}
                        </h1>
                        <p className="mt-2 max-w-3xl text-muted-foreground">
                            {translate("Manage users in the configured authentication backend")}
                        </p>
                    </header>

                    <div className="flex flex-col gap-6 p-5 md:p-8">
                        {capabilitiesLoading ? (
                            <CenteredState
                                action={
                                    <Spinner aria-label={translate("Loading user management capabilities")} size={28} />
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
                                    <Button onClick={handleCapabilityRetry}>
                                        <RefreshCw />
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
                                    <Button onClick={handleCapabilityRetry}>
                                        <RefreshCw />
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
                                    <Alert>
                                        <AlertDescription>
                                            {translate("User Management is currently available in read-only mode")}
                                        </AlertDescription>
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
                                        <div className="rounded-lg border bg-muted/30 p-4">
                                            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                                <div className="w-full md:max-w-lg">
                                                    <Label className="mb-2" htmlFor="user-management-search">
                                                        {translate("Search Users")}
                                                    </Label>
                                                    <div className="relative">
                                                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                                        <Input
                                                            className="h-10 pl-9"
                                                            id="user-management-search"
                                                            value={searchQuery}
                                                            onChange={(event) => handleSearchChange(event.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 justify-end gap-2">
                                                    <Button onClick={handleRefresh} variant="outline">
                                                        <RefreshCw />
                                                        {translate("Refresh")}
                                                    </Button>
                                                    {canCreate ? (
                                                        <Button onClick={handleOpenCreate}>
                                                            <Plus />
                                                            {translate("Create User")}
                                                        </Button>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>

                                        {usersError ? (
                                            <CenteredState
                                                action={
                                                    <Button onClick={handleRefresh}>
                                                        <RefreshCw />
                                                        {translate("Retry")}
                                                    </Button>
                                                }
                                                description={translate("Authelia could not load users right now")}
                                                title={translate("Unable to Load Users")}
                                            />
                                        ) : null}

                                        {!usersError && usersLoading ? (
                                            <CenteredState
                                                action={<Spinner aria-label={translate("Loading users")} size={28} />}
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
                                                <div className="flex flex-col items-center justify-between gap-3 border-t pt-4 text-sm text-muted-foreground sm:flex-row">
                                                    <label
                                                        className="flex items-center gap-2"
                                                        htmlFor="user-management-rows"
                                                    >
                                                        {translate("Rows per page")}
                                                        <select
                                                            className="h-9 rounded-md border border-input bg-background px-2 text-foreground"
                                                            id="user-management-rows"
                                                            value={rowsPerPage}
                                                            onChange={handleChangeRowsPerPage}
                                                        >
                                                            {rowsPerPageOptions.map((option) => (
                                                                <option key={option} value={option}>
                                                                    {option}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <div className="flex items-center gap-2">
                                                        <span>
                                                            {page * rowsPerPage + 1}-
                                                            {Math.min((page + 1) * rowsPerPage, users.length)} /{" "}
                                                            {users.length}
                                                        </span>
                                                        <Button
                                                            aria-label={translate("Go to previous page")}
                                                            disabled={page === 0}
                                                            onClick={() => handleChangePage(undefined, page - 1)}
                                                            size="icon-sm"
                                                            variant="ghost"
                                                        >
                                                            <ChevronLeft />
                                                        </Button>
                                                        <Button
                                                            aria-label={translate("Go to next page")}
                                                            disabled={(page + 1) * rowsPerPage >= users.length}
                                                            onClick={() => handleChangePage(undefined, page + 1)}
                                                            size="icon-sm"
                                                            variant="ghost"
                                                        >
                                                            <ChevronRight />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </Fragment>
                                        ) : null}
                                    </Fragment>
                                )}
                            </Fragment>
                        ) : null}
                    </div>
                </div>
            </div>
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
    const usernameError = errors.username || Boolean(helperText.username);
    const emailError = errors.email || Boolean(helperText.email);

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onClose();
            }}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto" showCloseButton={false}>
                <form noValidate onSubmit={onSubmit}>
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription>{subtitle}</DialogDescription>
                    </DialogHeader>
                    <div className="mt-6 space-y-4">
                        <div>
                            <Label className="mb-2" htmlFor="user-dialog-username">
                                {translate("Username")} *
                            </Label>
                            <Input
                                disabled={loading || readOnlyUsername}
                                error={usernameError}
                                id="user-dialog-username"
                                required
                                value={values.username}
                                onChange={(event) =>
                                    setValues((previous) => ({
                                        ...previous,
                                        username: event.target.value,
                                    }))
                                }
                            />
                            {helperText.username ? (
                                <p className="mt-1 text-sm text-destructive">{helperText.username}</p>
                            ) : null}
                        </div>
                        <div>
                            <Label className="mb-2" htmlFor="user-dialog-display-name">
                                {translate("Display Name")} *
                            </Label>
                            <Input
                                disabled={loading}
                                id="user-dialog-display-name"
                                required
                                value={values.displayName}
                                onChange={(event) =>
                                    setValues((previous) => ({
                                        ...previous,
                                        displayName: event.target.value,
                                    }))
                                }
                            />
                        </div>
                        <div>
                            <Label className="mb-2" htmlFor="user-dialog-email">
                                {translate("Email")} *
                            </Label>
                            <Input
                                disabled={loading}
                                error={emailError}
                                id="user-dialog-email"
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
                            {helperText.email ? (
                                <p className="mt-1 text-sm text-destructive">{helperText.email}</p>
                            ) : null}
                        </div>
                        {showPassword && canNotify ? (
                            <div className="flex items-start gap-3 text-sm">
                                <Checkbox
                                    checked={values.generatePassword}
                                    disabled={loading || values.email.trim() === ""}
                                    id="user-dialog-generate-password"
                                    onCheckedChange={(checked) =>
                                        setValues((previous) => ({
                                            ...previous,
                                            generatePassword: checked === true,
                                            notify: checked === true ? true : previous.notify,
                                            password: checked === true ? "" : previous.password,
                                        }))
                                    }
                                />
                                <Label htmlFor="user-dialog-generate-password">
                                    {translate("Generate random password and email it to the user")}
                                </Label>
                            </div>
                        ) : null}
                        {showPassword && !generatingPassword ? (
                            <div>
                                <Label className="mb-2" htmlFor="user-dialog-password">
                                    {translate("Password")} *
                                </Label>
                                <Input
                                    disabled={loading}
                                    error={errors.password}
                                    id="user-dialog-password"
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
                            </div>
                        ) : null}
                        <div>
                            <Label className="mb-2" htmlFor="user-dialog-groups">
                                {translate("Groups")}
                            </Label>
                            <Input
                                disabled={loading}
                                id="user-dialog-groups"
                                value={values.groups}
                                onChange={(event) =>
                                    setValues((previous) => ({
                                        ...previous,
                                        groups: event.target.value,
                                    }))
                                }
                            />
                            <p className="mt-1 text-sm text-muted-foreground">
                                {translate("Separate groups with commas")}
                            </p>
                        </div>
                        {groupValues.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {groupValues.map((group) => (
                                    <span className="rounded-md border px-2 py-1 text-xs" key={group}>
                                        {group}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        <div className="flex items-center gap-3 text-sm">
                            <Checkbox
                                checked={values.disabled}
                                disabled={loading}
                                id="user-dialog-disabled"
                                onCheckedChange={(checked) =>
                                    setValues((previous) => ({
                                        ...previous,
                                        disabled: checked === true,
                                    }))
                                }
                            />
                            <Label htmlFor="user-dialog-disabled">{translate("User disabled")}</Label>
                        </div>
                        {showPassword ? (
                            <div className="flex items-start gap-3 text-sm">
                                <Checkbox
                                    checked={values.notify}
                                    disabled={loading || !notificationEnabled || values.generatePassword}
                                    id="user-dialog-notify"
                                    onCheckedChange={(checked) =>
                                        setValues((previous) => ({
                                            ...previous,
                                            notify: checked === true,
                                        }))
                                    }
                                />
                                <Label htmlFor="user-dialog-notify">{translate("Notify user by email")}</Label>
                            </div>
                        ) : null}
                        {showPassword && !notificationEnabled ? (
                            <Alert>
                                <AlertDescription>
                                    {canNotify
                                        ? translate("Add an email address to enable notification delivery")
                                        : translate("Email notifications are unavailable for this backend")}
                                </AlertDescription>
                            </Alert>
                        ) : null}
                    </div>
                    <DialogFooter className="mt-6">
                        <Button disabled={loading} onClick={onClose} variant="outline">
                            {translate("Cancel")}
                        </Button>
                        <Button disabled={loading} type="submit">
                            {loading ? translate("Saving") : submitLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
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
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onClose();
            }}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto" showCloseButton={false}>
                <form noValidate onSubmit={onSubmit}>
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription>{translate("Set a new password for this user")}</DialogDescription>
                    </DialogHeader>
                    <div className="mt-6 space-y-4">
                        <div className="flex items-start gap-3 text-sm">
                            <Checkbox
                                checked={values.generatePassword}
                                disabled={loading || !canGeneratePassword}
                                id="password-reset-generate"
                                onCheckedChange={(checked) =>
                                    setValues((previous) => ({
                                        ...previous,
                                        generatePassword: checked === true,
                                        password: checked === true ? "" : previous.password,
                                    }))
                                }
                            />
                            <Label htmlFor="password-reset-generate">
                                {translate("Generate random password and email it to the user")}
                            </Label>
                        </div>
                        {!canGeneratePassword ? (
                            <Alert>
                                <AlertDescription>
                                    {canNotify
                                        ? translate("Email notification is unavailable for this user")
                                        : translate("Email notifications are unavailable for this backend")}
                                </AlertDescription>
                            </Alert>
                        ) : null}
                        {!values.generatePassword ? (
                            <div>
                                <Label className="mb-2" htmlFor="password-reset-password">
                                    {translate("New Password")} *
                                </Label>
                                <Input
                                    disabled={loading}
                                    error={errors.password}
                                    id="password-reset-password"
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
                            </div>
                        ) : null}
                    </div>
                    <DialogFooter className="mt-6">
                        <Button disabled={loading} onClick={onClose} variant="outline">
                            {translate("Cancel")}
                        </Button>
                        <Button disabled={loading} type="submit">
                            {loading ? translate("Saving") : translate("Reset Password")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

const ConfirmDialog = ({ actionLabel, description, loading, onClose, onConfirm, open, title }: ConfirmDialogProps) => {
    const { t: translate } = useTranslation("settings");

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onClose();
            }}
        >
            <DialogContent showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-4">
                    <Button disabled={loading} onClick={onClose} variant="outline">
                        {translate("Cancel")}
                    </Button>
                    <Button disabled={loading} onClick={onConfirm}>
                        {loading ? translate("Saving") : actionLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
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
}: UserTableProps) => (
    <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                    <th className="px-4 py-3 font-semibold">{translate("Username")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("Display Name")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("Email")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("Groups")}</th>
                    <th
                        aria-sort={statusSortDirection === "asc" ? "ascending" : "descending"}
                        className="px-4 py-3 font-semibold"
                    >
                        <Button className="-ml-3 h-7 px-3 text-xs" onClick={onStatusSort} size="sm" variant="ghost">
                            {translate("Status")}
                        </Button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">{translate("Actions")}</th>
                </tr>
            </thead>
            <tbody>
                {users.map((user) => (
                    <tr className="border-b last:border-0 hover:bg-muted/20" key={user.username}>
                        <td className="px-4 py-3 font-medium">{user.username}</td>
                        <td className="px-4 py-3">{user.display_name}</td>
                        <td className="px-4 py-3">{user.email || translate("Not Set")}</td>
                        <td className="px-4 py-3">
                            <GroupsList groups={user.groups} translate={translate} />
                        </td>
                        <td className="px-4 py-3">
                            <StatusChip disabled={user.disabled} translate={translate} />
                        </td>
                        <td className="px-4 py-3 text-right">
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
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

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
    <div className="space-y-3">
        {users.map((user) => (
            <Card className="gap-0 py-0" key={user.username}>
                <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="font-semibold">{user.display_name}</p>
                            <p className="text-sm text-muted-foreground">{user.username}</p>
                        </div>
                        <StatusChip disabled={user.disabled} translate={translate} />
                    </div>
                    <p className={`mt-3 text-sm ${user.email ? "" : "text-muted-foreground"}`}>
                        {user.email || translate("Not Set")}
                    </p>
                    <div className="mt-3">
                        <GroupsList groups={user.groups} translate={translate} />
                    </div>
                </CardContent>
                <CardFooter className="justify-end border-t px-5 py-3">
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
                </CardFooter>
            </Card>
        ))}
    </div>
);

const GroupsList = ({ groups, translate }: { groups: string[]; translate: (key: string) => string }) =>
    groups.length > 0 ? (
        <div className="flex flex-wrap gap-2">
            {groups.map((group) => (
                <span className="rounded-md border px-2 py-1 text-xs" key={group}>
                    {group}
                </span>
            ))}
        </div>
    ) : (
        <span className="text-sm text-muted-foreground">{translate("No Groups")}</span>
    );

const StatusChip = ({ disabled, translate }: { disabled: boolean; translate: (key: string) => string }) => (
    <span
        className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${
            disabled
                ? "border-muted-foreground/30 bg-muted/30 text-muted-foreground"
                : "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400"
        }`}
    >
        {disabled ? translate("Disabled") : translate("Enabled")}
    </span>
);

const ActionButton = ({
    ariaLabel,
    children,
    label,
    onClick,
}: {
    ariaLabel: string;
    children: ReactNode;
    label: string;
    onClick: () => void;
}) => (
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger
                render={
                    <Button aria-label={ariaLabel} onClick={onClick} size="icon-sm" variant="ghost">
                        {children}
                    </Button>
                }
            />
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    </TooltipProvider>
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
    <div className="flex justify-end gap-1">
        {canUpdate ? (
            <ActionButton
                ariaLabel={`${translate("Edit User")} ${user.username}`}
                label={translate("Edit User")}
                onClick={onEdit}
            >
                <Pencil />
            </ActionButton>
        ) : null}
        {canResetPassword ? (
            <ActionButton
                ariaLabel={`${translate("Reset Password")} ${user.username}`}
                label={translate("Reset Password")}
                onClick={onResetPassword}
            >
                <KeyRound />
            </ActionButton>
        ) : null}
        {canUpdate ? (
            <ActionButton
                ariaLabel={`${user.disabled ? translate("Enable User") : translate("Disable User")} ${user.username}`}
                label={user.disabled ? translate("Enable User") : translate("Disable User")}
                onClick={onToggle}
            >
                {user.disabled ? <UserRound /> : <UserRoundX />}
            </ActionButton>
        ) : null}
        {canDelete ? (
            <ActionButton
                ariaLabel={`${translate("Delete User")} ${user.username}`}
                label={translate("Delete User")}
                onClick={onDelete}
            >
                <Trash2 />
            </ActionButton>
        ) : null}
    </div>
);

const CenteredState = ({ action, description, title }: { action?: ReactNode; description: string; title: string }) => (
    <Card className="min-h-52 items-center justify-center bg-muted/20 px-6 py-10 text-center">
        <CardContent className="flex max-w-md flex-col items-center gap-3 p-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-muted-foreground">{description}</p>
            {action}
        </CardContent>
    </Card>
);

export default UserManagementView;
