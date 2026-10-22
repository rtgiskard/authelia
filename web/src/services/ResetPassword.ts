// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import axios from "axios";

import {
    CompleteResetPasswordPath,
    ErrorResponse,
    InitiateResetPasswordPath,
    OKResponse,
    ResetPasswordPath,
    validateStatusTooManyRequests,
} from "@services/Api";
import { PostWithOptionalResponseRateLimited } from "@services/Client";

export interface PasswordResetResponse {
    reset_links_revocation_error?: string;
}

export async function initiateResetPasswordProcess(username: string) {
    return PostWithOptionalResponseRateLimited(InitiateResetPasswordPath, { username });
}

export async function completeResetPasswordProcess(token: string) {
    return PostWithOptionalResponseRateLimited(CompleteResetPasswordPath, { token });
}

export async function resetPassword(token: string, newPassword: string) {
    return PostWithOptionalResponseRateLimited<PasswordResetResponse>(ResetPasswordPath, {
        password: newPassword,
        token,
    });
}

export async function deleteResetPasswordToken(token: string) {
    const res = await axios<ErrorResponse | OKResponse>({
        data: { token: token },
        method: "DELETE",
        url: ResetPasswordPath,
        validateStatus: validateStatusTooManyRequests,
    });

    return { ok: res.status === 200 && res.data.status === "OK", status: res.status };
}
