import { useState } from "react";

import { act, render, screen, waitFor } from "@testing-library/react";

import { generateUserSessionElevation } from "@services/UserSessionElevation";
import type { UserSessionElevation } from "@services/UserSessionElevation";
import IdentityVerificationDialog from "@views/Settings/Common/IdentityVerificationDialog";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@contexts/NotificationsContext", () => ({
    useNotifications: () => ({
        createErrorNotification: vi.fn(),
    }),
}));

vi.mock("@components/OneTimeCodeTextField", () => ({
    default: (props: { value: string }) => <input data-testid="one-time-code" value={props.value} readOnly />,
}));

vi.mock("@components/SuccessIcon", () => ({
    default: () => <div data-testid="success-icon" />,
}));

vi.mock("@services/UserSessionElevation", () => ({
    deleteUserSessionElevation: vi.fn(),
    generateUserSessionElevation: vi.fn().mockResolvedValue({ delete_id: "del-123" }),
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
    vi.mocked(generateUserSessionElevation).mockResolvedValue({ delete_id: "del-123" });
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
    let resolveGenerate = (_value: { delete_id: string }) => {};
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
        resolveGenerate({ delete_id: "del-123" });
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
