// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { RateLimitedData } from "@services/Api";
import { initiateResetPasswordProcess } from "@services/ResetPassword";
import ResetPasswordStep1 from "@views/ResetPassword/ResetPasswordStep1";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@layouts/MinimalLayout", () => ({ default: (props: { children: ReactNode }) => <div>{props.children}</div> }));
vi.mock("@services/ResetPassword", () => ({ initiateResetPasswordProcess: vi.fn() }));
const initiate = vi.mocked(initiateResetPasswordProcess);
const submit = () => fireEvent.submit(document.querySelector("form")!);
const fill = () => fireEvent.change(screen.getByLabelText("Username"), { target: { value: "john" } });

beforeEach(() => {
    navigate.mockReset();
    initiate.mockReset().mockResolvedValue({ limited: false, retryAfter: 0 });
});
afterEach(() => {
    vi.useRealTimers();
});

it("does not send an empty account request", () => {
    render(<ResetPasswordStep1 />);
    submit();
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
    expect(initiate).not.toHaveBeenCalled();
});

it("shows confirmation without exposing account existence or automatically navigating", async () => {
    render(<ResetPasswordStep1 />);
    fill();
    submit();
    await waitFor(() => expect(document.querySelector("form")).not.toBeInTheDocument());
    expect(initiate).toHaveBeenCalledWith("john");
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(navigate).toHaveBeenCalledWith("/");
});

it("prevents duplicate requests while waiting", async () => {
    const response = Promise.withResolvers<RateLimitedData<undefined>>();
    initiate.mockReturnValue(response.promise);
    render(<ResetPasswordStep1 />);
    fill();
    submit();
    submit();
    expect(initiate).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Username")).toBeDisabled();
    await act(async () => {
        response.resolve({ limited: false, retryAfter: 0 });
    });
});

it("retains the account and permits retry after a network failure", async () => {
    initiate.mockRejectedValueOnce(new Error("network unavailable"));
    render(<ResetPasswordStep1 />);
    fill();
    submit();
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Username")).toHaveValue("john");
    submit();
    await waitFor(() => expect(document.querySelector("form")).not.toBeInTheDocument());
    expect(initiate).toHaveBeenCalledTimes(2);
});

it("does not treat a missing service response as delivery success", async () => {
    initiate.mockResolvedValue(undefined);
    render(<ResetPasswordStep1 />);
    fill();
    submit();
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Username")).toHaveValue("john");
    expect(navigate).not.toHaveBeenCalled();
});

it("blocks submissions until the rate limit window ends", async () => {
    vi.useFakeTimers();
    initiate.mockResolvedValueOnce({ limited: true, retryAfter: 30 });
    render(<ResetPasswordStep1 />);
    fill();
    await act(async () => {
        submit();
    });
    submit();
    expect(initiate).toHaveBeenCalledTimes(1);
    expect(document.getElementById("reset-button")).toBeDisabled();
    await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
    });
    expect(document.getElementById("reset-button")).not.toBeDisabled();
    await act(async () => {
        submit();
    });
    expect(initiate).toHaveBeenCalledTimes(2);
});

it("returns without sending a reset request", () => {
    render(<ResetPasswordStep1 />);
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(navigate).toHaveBeenCalledWith("/");
    expect(initiate).not.toHaveBeenCalled();
});
