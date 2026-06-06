import { useState } from "react";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { UserSessionElevation } from "@services/UserSessionElevation";
import { generateUserSessionElevation, verifyUserSessionElevation } from "@services/UserSessionElevation";
import IdentityVerificationDialog from "@views/Settings/Common/IdentityVerificationDialog";

const mockCreateErrorNotification = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@contexts/NotificationsContext", () => ({
    useNotifications: () => ({
        createErrorNotification: mockCreateErrorNotification,
    }),
}));

vi.mock("@components/OneTimeCodeTextField", () => ({
    default: (props: {
        disabled?: boolean;
        onChange: (_event: { target: { value: string } }) => void;
        value: string;
    }) => <input data-testid="one-time-code" disabled={props.disabled} value={props.value} onChange={props.onChange} />,
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
        data: { delete_id: "del-123" },
        limited: false,
        retryAfter: 0,
    });
});

it("renders dialog with title when opening and elevation resolve", async () => {
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
    expect(screen.getByText("Identity Verification")).toBeInTheDocument();
});

it("renders cancel and verify buttons after elevation generation resolves", async () => {
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
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Verify")).toBeInTheDocument();
});

it("does not render content when not opening", () => {
    render(
        <IdentityVerificationDialog
            elevation={elevation}
            opening={false}
            handleClosed={vi.fn()}
            handleOpened={vi.fn()}
        />,
    );
    expect(screen.queryByText("Verify")).not.toBeInTheDocument();
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

    await waitFor(() => expect(mockCreateErrorNotification).toHaveBeenCalledWith("You have made too many requests"));

    expect(handleClosed).toHaveBeenCalledWith(false);
    expect(handleOpened).not.toHaveBeenCalled();
    expect(screen.queryByText("Verify")).not.toBeInTheDocument();
});

it("resets loading and shows failure notification when verification rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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
        expect(mockCreateErrorNotification).toHaveBeenCalledWith(
            "The One-Time Code either doesn't match the one generated or an unknown error occurred",
        ),
    );

    expect(consoleError).toHaveBeenCalledWith(error);
    expect(input).not.toBeDisabled();

    consoleError.mockRestore();
});
