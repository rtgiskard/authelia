// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import axios, { AxiosHeaders } from "axios";

import { deleteResetPasswordToken } from "@services/ResetPassword";

vi.mock("axios");
vi.mock("@services/Api", () => ({
    CompleteResetPasswordPath: "/reset-password/finish",
    InitiateResetPasswordPath: "/reset-password/start",
    ResetPasswordPath: "/reset-password",
    validateStatusTooManyRequests: vi.fn(),
}));

it("deletes reset password token with ok", async () => {
    vi.mocked(axios).mockResolvedValue({
        config: { headers: new AxiosHeaders() },
        data: { status: "OK" },
        headers: {},
        status: 200,
        statusText: "OK",
    });
    const result = await deleteResetPasswordToken("token123");
    expect(result).toEqual({ ok: true, status: 200 });
});

it("deletes reset password token with error", async () => {
    vi.mocked(axios).mockResolvedValue({
        config: { headers: new AxiosHeaders() },
        data: { status: "KO" },
        headers: {},
        status: 400,
        statusText: "Bad Request",
    });
    const result = await deleteResetPasswordToken("token123");
    expect(result).toEqual({ ok: false, status: 400 });
});
