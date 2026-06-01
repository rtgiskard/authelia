import { AdminUsersPath } from "@services/Api";
import { Get, PatchWithOptionalResponse, PostWithOptionalResponse, PutWithOptionalResponse } from "@services/Client";

export interface AdminUserManagementCapabilities {
    can_create: boolean;
    can_list: boolean;
    can_notify: boolean;
    can_reset_password: boolean;
    can_update: boolean;
    supported: boolean;
}

export interface AdminUser {
    username: string;
    display_name: string;
    email: string;
    groups: string[];
    disabled: boolean;
}

export interface AdminCreateUserNotificationStatus {
    message?: string;
    status: "failed" | "sent" | "skipped";
}

export interface AdminCreateUserResponse {
    notification?: AdminCreateUserNotificationStatus;
    user?: AdminUser;
}

interface AdminUserManagementCapabilitiesResponse {
    create: boolean;
    delete: boolean;
    list: boolean;
    read: boolean;
    reset_password: boolean;
    update: boolean;
}

interface AdminUserListResponse {
    total: number;
    users: AdminUser[];
}

interface AdminCreateUserResponseBody {
    notification_error?: string;
    notification_reason?: string;
    notification_sent: boolean;
}

export interface AdminPasswordResetPayload {
    password: string;
}

export interface AdminUpdateUserPayload {
    disabled: boolean;
    display_name: string;
    email: string;
    groups: string[];
}

export interface AdminCreateUserPayload {
    disabled: boolean;
    display_name: string;
    email: string;
    groups: string[];
    notify: boolean;
    password: string;
    username: string;
}

export function createAdminUser(payload: AdminCreateUserPayload) {
    return PostWithOptionalResponse<AdminCreateUserResponseBody>(AdminUsersPath, payload).then(
        toAdminCreateUserResponse,
    );
}

export function getAdminUserManagementCapabilities(signal?: AbortSignal) {
    return Get<AdminUserManagementCapabilitiesResponse>(`${AdminUsersPath}/capabilities`, signal).then(
        (capabilities) => ({
            can_create: capabilities.create,
            can_list: capabilities.list,
            can_notify: capabilities.create,
            can_reset_password: capabilities.reset_password,
            can_update: capabilities.update,
            supported:
                capabilities.create ||
                capabilities.list ||
                capabilities.read ||
                capabilities.update ||
                capabilities.reset_password,
        }),
    );
}

export function listAdminUsers(query = "", signal?: AbortSignal) {
    const params = new URLSearchParams();

    if (query !== "") {
        params.set("search", query);
    }

    const path = params.size > 0 ? `${AdminUsersPath}?${params.toString()}` : AdminUsersPath;

    return Get<AdminUserListResponse>(path, signal).then((result) => result.users);
}

export function getAdminUser(username: string, signal?: AbortSignal) {
    return Get<AdminUser>(`${AdminUsersPath}/${encodeURIComponent(username)}`, signal);
}

export function updateAdminUser(username: string, payload: AdminUpdateUserPayload, signal?: AbortSignal) {
    return PatchWithOptionalResponse<AdminUser>(`${AdminUsersPath}/${encodeURIComponent(username)}`, payload, signal);
}

export function resetAdminUserPassword(username: string, payload: AdminPasswordResetPayload, signal?: AbortSignal) {
    return PutWithOptionalResponse(`${AdminUsersPath}/${encodeURIComponent(username)}/password`, payload, signal);
}

function toAdminCreateUserResponse(
    response: AdminCreateUserResponseBody | undefined,
): AdminCreateUserResponse | undefined {
    if (!response) {
        return undefined;
    }

    if (response.notification_sent) {
        return { notification: { status: "sent" } };
    }

    if (response.notification_error) {
        return {
            notification: { message: "User saved but email notification could not be sent", status: "failed" },
        };
    }

    if (response.notification_reason) {
        return {
            notification: {
                message: response.notification_reason,
                status: "skipped",
            },
        };
    }

    return undefined;
}
