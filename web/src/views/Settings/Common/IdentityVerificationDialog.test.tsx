// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { UserSessionElevation } from "@services/UserSessionElevation";
import {
    deleteUserSessionElevation,
    generateUserSessionElevation,
    verifyUserSessionElevation,
} from "@services/UserSessionElevation";
import IdentityVerificationDialog from "@views/Settings/Common/IdentityVerificationDialog";

const mocks = vi.hoisted(() => ({
    createErrorNotification: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@contexts/NotificationsContext", () => ({
    useNotifications: () => ({
        createErrorNotification: mocks.createErrorNotification,
    }),
}));

vi.mock("@components/OneTimeCodeTextField", () => ({
    default: (props: any) => (
        <input
            data-testid="one-time-code"
            id={props.id}
            ref={props.inputRef}
            value={props.value}
            aria-invalid={props.error}
            disabled={props.disabled}
            onChange={props.onChange}
            onKeyDown={props.onKeyDown}
        />
    ),
}));

vi.mock("@components/SuccessIcon", () => ({
    default: () => <div data-testid="success-icon" />,
}));

vi.mock("@services/UserSessionElevation", () => ({
    deleteUserSessionElevation: vi.fn(),
    generateUserSessionElevation: vi.fn().mockResolvedValue({
        data: { delete_id: "del-123" },
        limited: false,
        retryAfter: 0,
    }),
    verifyUserSessionElevation: vi.fn(),
}));
const generateMock = vi.mocked(generateUserSessionElevation);
const verifyMock = vi.mocked(verifyUserSessionElevation);
const deleteMock = vi.mocked(deleteUserSessionElevation);

const elevation: UserSessionElevation = {
    can_skip_second_factor: false,
    elevated: false,
    expires: 0,
    factor_knowledge: false,
    require_second_factor: true,
    skip_second_factor: false,
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateUserSessionElevation).mockResolvedValue({
        data: { delete_id: "delete-id" },
        limited: false,
        retryAfter: 0,
    });
    verifyMock.mockResolvedValue(true);
    deleteMock.mockResolvedValue(true);
});

function renderDialog(
    props: Partial<{
        elevation: any;
        handleClosed: (ok: boolean) => void;
        handleOpened: () => void;
        opening: boolean;
    }> = {},
) {
    const handleClosed = props.handleClosed ?? vi.fn();
    const handleOpened = props.handleOpened ?? vi.fn();
    const merged = { elevation, opening: true, ...props, handleClosed, handleOpened };

    return { ...render(<IdentityVerificationDialog {...merged} />), handleClosed, handleOpened };
}

function getCode() {
    return document.getElementById("one-time-code") as HTMLInputElement;
}

function clickVerify() {
    fireEvent.click(document.getElementById("dialog-verify") as HTMLButtonElement);
}

function clickCancel() {
    fireEvent.click(document.getElementById("dialog-cancel") as HTMLButtonElement);
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("rendering", () => {
    it("renders cancel and verify buttons after elevation generation resolves", async () => {
        renderDialog();
        expect(await screen.findByText("Cancel")).toBeInTheDocument();
        expect(screen.getByText("Verify")).toBeInTheDocument();
    });

    it("does not render content when not opening", () => {
        renderDialog({ opening: false });
        expect(screen.queryByText("Identity Verification")).not.toBeInTheDocument();
        expect(generateMock).not.toHaveBeenCalled();
    });

    it("does not generate a code without an elevation", () => {
        renderDialog({ elevation: undefined });
        expect(generateMock).not.toHaveBeenCalled();
    });

    it("generates the code only once", async () => {
        const { rerender } = renderDialog();
        await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));

        rerender(
            <IdentityVerificationDialog
                elevation={elevation}
                opening={true}
                handleClosed={vi.fn()}
                handleOpened={vi.fn()}
            />,
        );

        await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
    });
});

describe("code generation failures", () => {
    it("notifies and closes when generation rejects", async () => {
        generateMock.mockRejectedValue(new Error("boom"));

        const { handleClosed } = renderDialog();

        await waitFor(() =>
            expect(mocks.createErrorNotification).toHaveBeenCalledWith(
                "Failed to generate the One-Time Code. Please try again later.",
            ),
        );
        expect(handleClosed).toHaveBeenCalledWith(false);
    });

    it("notifies and closes when generation returns nothing", async () => {
        generateMock.mockResolvedValue(null as any);

        const { handleClosed } = renderDialog();

        await waitFor(() =>
            expect(mocks.createErrorNotification).toHaveBeenCalledWith(
                "Failed to generate the One-Time Code. Please try again later.",
            ),
        );
        expect(handleClosed).toHaveBeenCalledWith(false);
    });
});

describe("code entry", () => {
    it("records the typed code", async () => {
        renderDialog();
        await screen.findByText("Verify");

        fireEvent.change(getCode(), { target: { value: "123456" } });

        await waitFor(() => expect(getCode()).toHaveValue("123456"));
    });

    it("strips whitespace from the code", async () => {
        renderDialog();
        await screen.findByText("Verify");

        fireEvent.change(getCode(), { target: { value: "123 456" } });

        await waitFor(() => expect(getCode()).toHaveValue("123456"));
    });

    it("does nothing when verifying an empty code", async () => {
        renderDialog();
        await screen.findByText("Verify");

        clickVerify();

        await waitFor(() => expect(verifyMock).not.toHaveBeenCalled());
    });
});

describe("verification", () => {
    it("verifies the code and closes after the success delay", async () => {
        vi.useFakeTimers();

        const handleClosed = vi.fn();
        renderDialog({ handleClosed });

        await vi.waitFor(() => expect(screen.getByText("Verify")).toBeInTheDocument());
        fireEvent.change(getCode(), { target: { value: "123456" } });
        clickVerify();

        await vi.waitFor(() => expect(verifyMock).toHaveBeenCalledWith("123456"));
        await vi.waitFor(() => expect(screen.getByTestId("success-icon")).toBeInTheDocument());
        expect(handleClosed).not.toHaveBeenCalled();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(750);
        });

        expect(handleClosed).toHaveBeenCalledWith(true);
    });

    it("hides the footer once verification succeeded", async () => {
        renderDialog();
        await screen.findByText("Verify");

        fireEvent.change(getCode(), { target: { value: "123456" } });
        clickVerify();

        await waitFor(() => expect(screen.getByTestId("success-icon")).toBeInTheDocument());
        expect(screen.queryByText("Verify")).not.toBeInTheDocument();
    });

    it("notifies, clears and refocuses the field on a wrong code", async () => {
        verifyMock.mockResolvedValue(false as any);

        renderDialog();
        await screen.findByText("Verify");

        fireEvent.change(getCode(), { target: { value: "123456" } });
        clickVerify();

        await waitFor(() =>
            expect(mocks.createErrorNotification).toHaveBeenCalledWith(
                "The One-Time Code either doesn't match the one generated or an unknown error occurred",
            ),
        );
        await waitFor(() => expect(getCode()).toHaveValue(""));
        expect(getCode()).toHaveAttribute("aria-invalid", "true");
        expect(getCode()).toHaveFocus();
    });

    it("clears the error once the user retypes", async () => {
        verifyMock.mockResolvedValue(false as any);

        renderDialog();
        await screen.findByText("Verify");

        fireEvent.change(getCode(), { target: { value: "123456" } });
        clickVerify();
        await waitFor(() => expect(getCode()).toHaveAttribute("aria-invalid", "true"));

        fireEvent.change(getCode(), { target: { value: "654321" } });

        await waitFor(() => expect(getCode()).toHaveAttribute("aria-invalid", "false"));
    });

    it("disables the controls while verifying", async () => {
        let resolve: (value: unknown) => void = () => {};
        verifyMock.mockReturnValue(new Promise((r) => (resolve = r)) as any);

        renderDialog();
        await screen.findByText("Verify");

        fireEvent.change(getCode(), { target: { value: "123456" } });
        clickVerify();

        await waitFor(() => expect(document.getElementById("dialog-verify")).toBeDisabled());
        expect(document.getElementById("dialog-cancel")).toBeDisabled();
        expect(getCode()).toBeDisabled();

        resolve(true);
        await waitFor(() => expect(screen.getByTestId("success-icon")).toBeInTheDocument());
    });
});

describe("keyboard handling", () => {
    it("verifies on Enter", async () => {
        renderDialog();
        await screen.findByText("Verify");

        fireEvent.change(getCode(), { target: { value: "123456" } });
        fireEvent.keyDown(getCode(), { key: "Enter" });

        await waitFor(() => expect(verifyMock).toHaveBeenCalledWith("123456"));
    });

    it("flags an empty code on Enter", async () => {
        renderDialog();
        await screen.findByText("Verify");

        fireEvent.keyDown(getCode(), { key: "Enter" });

        await waitFor(() => expect(getCode()).toHaveAttribute("aria-invalid", "true"));
        expect(verifyMock).not.toHaveBeenCalled();
    });

    it("ignores keys other than Enter", async () => {
        renderDialog();
        await screen.findByText("Verify");

        fireEvent.change(getCode(), { target: { value: "123456" } });
        fireEvent.keyDown(getCode(), { key: "a" });

        expect(verifyMock).not.toHaveBeenCalled();
    });
});

describe("cancelling", () => {
    it("invalidates the code and closes", async () => {
        const { handleClosed } = renderDialog();
        await screen.findByText("Cancel");

        clickCancel();

        await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("delete-id"));
        expect(handleClosed).toHaveBeenCalledWith(false);
    });

    it("closes when code invalidation fails", async () => {
        deleteMock.mockRejectedValue(new Error("boom"));

        const { handleClosed } = renderDialog();
        await screen.findByText("Cancel");

        clickCancel();

        await waitFor(() => expect(handleClosed).toHaveBeenCalledWith(false));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});

describe("dismissal", () => {
    it("cancels when Escape is pressed", async () => {
        const { handleClosed } = renderDialog();
        await screen.findByText("Cancel");

        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

        await waitFor(() => expect(handleClosed).toHaveBeenCalledWith(false));
    });
});

describe("cleanup", () => {
    it("does not close the parent after unmounting during success", async () => {
        vi.useFakeTimers();
        const handleClosed = vi.fn();
        const { unmount } = renderDialog({ handleClosed });

        await vi.waitFor(() => expect(screen.getByText("Verify")).toBeInTheDocument());
        fireEvent.change(getCode(), { target: { value: "123456" } });
        clickVerify();
        await vi.waitFor(() => expect(screen.getByTestId("success-icon")).toBeInTheDocument());

        unmount();
        await act(async () => {
            await vi.runOnlyPendingTimersAsync();
        });

        expect(handleClosed).not.toHaveBeenCalled();
    });
});

it("keeps the dialog visible when handleOpened clears the parent opening flag", async () => {
    const ParentClearsOpening = () => {
        const [opening, setOpening] = useState(true);

        return (
            <IdentityVerificationDialog
                elevation={elevation}
                opening={opening}
                handleClosed={vi.fn()}
                handleOpened={() => setOpening(false)}
            />
        );
    };

    await act(async () => {
        render(<ParentClearsOpening />);
    });

    expect(screen.getByText("Identity Verification")).toBeInTheDocument();
    expect(screen.getByText("Verify")).toBeInTheDocument();
});

it("generates only one elevation code across rerenders during the same opening sequence", async () => {
    let resolveGenerate = (_value: { data: { delete_id: string }; limited: boolean; retryAfter: number }) => {};
    vi.mocked(generateUserSessionElevation).mockReturnValue(
        new Promise((resolve) => {
            resolveGenerate = resolve;
        }),
    );

    const handleClosed = vi.fn();
    const handleOpened = vi.fn();

    const { rerender } = render(
        <IdentityVerificationDialog
            elevation={elevation}
            opening={true}
            handleClosed={handleClosed}
            handleOpened={handleOpened}
        />,
    );

    await waitFor(() => expect(generateUserSessionElevation).toHaveBeenCalledTimes(1));

    rerender(
        <IdentityVerificationDialog
            elevation={elevation}
            opening={true}
            handleClosed={handleClosed}
            handleOpened={handleOpened}
        />,
    );

    expect(generateUserSessionElevation).toHaveBeenCalledTimes(1);

    await act(async () => {
        resolveGenerate({
            data: { delete_id: "del-123" },
            limited: false,
            retryAfter: 0,
        });
    });

    rerender(
        <IdentityVerificationDialog
            elevation={elevation}
            opening={true}
            handleClosed={handleClosed}
            handleOpened={handleOpened}
        />,
    );

    expect(generateUserSessionElevation).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Verify")).toBeInTheDocument();
});

it("shows a rate-limit notification without opening the dialog when generation is rate limited", async () => {
    const handleClosed = vi.fn();
    const handleOpened = vi.fn();

    vi.mocked(generateUserSessionElevation).mockResolvedValue({
        limited: true,
        retryAfter: 30,
    });

    await act(async () => {
        render(
            <IdentityVerificationDialog
                elevation={elevation}
                opening={true}
                handleClosed={handleClosed}
                handleOpened={handleOpened}
            />,
        );
    });

    await waitFor(() => expect(mocks.createErrorNotification).toHaveBeenCalledWith("You have made too many requests"));

    expect(handleClosed).toHaveBeenCalledWith(false);
    expect(handleOpened).not.toHaveBeenCalled();
    expect(screen.queryByText("Verify")).not.toBeInTheDocument();
});

it("resets loading and shows failure notification when verification rejects", async () => {
    const error = new Error("network");

    vi.mocked(verifyUserSessionElevation).mockRejectedValue(error);

    await act(async () => {
        render(
            <IdentityVerificationDialog
                elevation={elevation}
                opening={true}
                handleClosed={vi.fn()}
                handleOpened={vi.fn()}
            />,
        );
    });

    const input = screen.getByTestId("one-time-code");
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.click(screen.getByText("Verify"));

    await waitFor(() =>
        expect(mocks.createErrorNotification).toHaveBeenCalledWith(
            "The One-Time Code either doesn't match the one generated or an unknown error occurred",
        ),
    );

    expect(input).not.toBeDisabled();
});
