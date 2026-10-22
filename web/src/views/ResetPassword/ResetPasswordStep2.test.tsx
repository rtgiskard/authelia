// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { PasswordPolicyMode } from "@models/PasswordPolicy";
import type { RateLimitedData } from "@services/Api";
import { getPasswordPolicyConfiguration } from "@services/PasswordPolicyConfiguration";
import type { PasswordResetResponse } from "@services/ResetPassword";
import { completeResetPasswordProcess, resetPassword } from "@services/ResetPassword";
import ResetPasswordStep2 from "@views/ResetPassword/ResetPasswordStep2";

const mocks = vi.hoisted(() => ({
    createErrorNotification: vi.fn(),
    createSuccessNotification: vi.fn(),
    createWarnNotification: vi.fn(),
    navigate: vi.fn(),
    translate: (key: string) => key,
}));
const query = vi.hoisted(() => ({ token: "test-token" as string | undefined }));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.translate }) }));
vi.mock("@contexts/NotificationsContext", () => ({ useNotifications: () => mocks }));
vi.mock("@hooks/QueryParam", () => ({ useQueryParam: () => query.token }));
vi.mock("react-router", async () => ({
    ...(await vi.importActual("react-router")),
    useNavigate: () => mocks.navigate,
}));
vi.mock("@layouts/MinimalLayout", () => ({ default: (props: { children: ReactNode }) => <div>{props.children}</div> }));
vi.mock("@services/ResetPassword", () => ({ completeResetPasswordProcess: vi.fn(), resetPassword: vi.fn() }));
vi.mock("@services/PasswordPolicyConfiguration", () => ({ getPasswordPolicyConfiguration: vi.fn() }));
vi.mock("@components/PasswordMeter", () => ({ default: () => null }));

const preview = vi.mocked(completeResetPasswordProcess);
const reset = vi.mocked(resetPassword);
const policy = vi.mocked(getPasswordPolicyConfiguration);
const policyValue = {
    max_length: 0,
    min_length: 8,
    min_score: 0,
    mode: PasswordPolicyMode.Standard,
    require_lowercase: false,
    require_number: false,
    require_special: false,
    require_uppercase: false,
};

function renderStep() {
    return render(
        <MemoryRouter>
            <ResetPasswordStep2 />
        </MemoryRouter>,
    );
}
function first() {
    return screen.getByLabelText("New password");
}
function repeat() {
    return screen.getByLabelText("Repeat new password");
}
function submit() {
    return screen.getByRole("button", { name: "Save new password" });
}
async function ready() {
    const result = renderStep();
    await waitFor(() => expect(submit()).not.toBeDisabled());
    return result;
}
function fill(password = "password123", confirmation = password) {
    fireEvent.change(first(), { target: { value: password } });
    fireEvent.change(repeat(), { target: { value: confirmation } });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    query.token = "test-token";
    preview.mockResolvedValue({ limited: false, retryAfter: 0 });
    policy.mockResolvedValue(policyValue);
    reset.mockResolvedValue({ limited: false, retryAfter: 0 });
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

it("does not allow a password submission before the link is validated", () => {
    preview.mockReturnValue(Promise.withResolvers<RateLimitedData<undefined>>().promise);
    renderStep();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save new password" })).not.toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
});

it("lets a user retry opening the form without applying for another email", async () => {
    preview.mockRejectedValueOnce(new Error("network unavailable"));
    renderStep();
    await screen.findByRole("alert");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(submit()).not.toBeDisabled());
    expect(reset).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
});

it("provides a way to request a new link when the current one is unavailable", async () => {
    query.token = undefined;
    renderStep();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Request a new link" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/reset-password/step1");
    expect(reset).not.toHaveBeenCalled();
});

it("does not let a stale preview enable a different invalid link", async () => {
    const oldPreview = Promise.withResolvers<RateLimitedData<undefined>>();
    preview.mockReturnValueOnce(oldPreview.promise);
    const view = renderStep();
    query.token = "another-token";
    preview.mockRejectedValueOnce(new Error("expired"));
    view.rerender(
        <MemoryRouter>
            <ResetPasswordStep2 />
        </MemoryRouter>,
    );
    await screen.findByRole("alert");
    await act(async () => {
        oldPreview.resolve({ limited: false, retryAfter: 0 });
    });
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
});

it("preserves mismatched passwords so the user can correct them", async () => {
    await ready();
    fill("password123", "different123");
    fireEvent.click(submit());
    expect(first()).toHaveValue("password123");
    expect(repeat()).toHaveValue("different123");
    expect(repeat()).toHaveAttribute("aria-invalid", "true");
    expect(reset).not.toHaveBeenCalled();
});

it("preserves fields and permits correction after server policy rejection", async () => {
    reset.mockRejectedValueOnce(new Error("password does not meet policy"));
    await ready();
    fill();
    fireEvent.click(submit());
    await waitFor(() => expect(submit()).not.toBeDisabled());
    expect(first()).toHaveValue("password123");
    expect(repeat()).toHaveValue("password123");
    expect(mocks.navigate).not.toHaveBeenCalled();
});

it("does not submit the same password change twice while waiting", async () => {
    reset.mockReturnValue(Promise.withResolvers<RateLimitedData<PasswordResetResponse>>().promise);
    await ready();
    fill();
    fireEvent.submit(document.querySelector("form")!);
    fireEvent.submit(document.querySelector("form")!);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(document.getElementById("reset-button")).toBeDisabled();
});

it("removes the form after success and returns only when the user is ready", async () => {
    await ready();
    fill();
    fireEvent.click(submit());
    await waitFor(() => expect(screen.queryByLabelText("New password")).not.toBeInTheDocument());
    expect(document.querySelector("form")).not.toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/");
});
