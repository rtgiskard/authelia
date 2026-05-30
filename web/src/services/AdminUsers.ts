import { AdminUsersPath } from "@services/Api";
import { PostWithOptionalResponse } from "@services/Client";

export interface AdminCreateUserPayload {
    username: string;
    password: string;
    display_name: string;
    email: string;
    groups: string[];
    disabled: boolean;
}

export function createAdminUser(payload: AdminCreateUserPayload) {
    return PostWithOptionalResponse(AdminUsersPath, payload);
}
