import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SecurityView from "@views/Settings/Security/SecurityView";

const mocks = vi.hoisted(() => ({
    changePasswordDialog: vi.fn(({ flow, open }: { flow: string; open: boolean }) => (
        <div data-flow={flow} data-open={open ? "true" : "false"} data-testid="change-password-dialog" />
    )),
    fetchConfiguration: vi.fn(),
    fetchUserInfo: vi.fn(),
    getUserSessionElevation: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@mui/material", async () => {
    const actual = await vi.importActual("@mui/material");
    return {
        ...actual,
        useTheme: () => ({
            palette: { grey: { 600: "#999" } },
            spacing: (n: number) => `${(n || 1) * 8}px`,
        }),
    };
});

vi.mock("@hooks/Configuration", () => ({
    useConfiguration: () => [{ password_change_disabled: false }, mocks.fetchConfiguration, false, null],
}));

vi.mock("@contexts/NotificationsContext", () => ({
    useNotifications: () => ({
        createErrorNotification: vi.fn(),
        createSuccessNotification: vi.fn(),
    }),
}));

vi.mock("@hooks/UserInfo", () => ({
    useUserInfoGET: () => [
        { display_name: "John Doe", emails: ["john@example.com"], groups: [] },
        mocks.fetchUserInfo,
        false,
        null,
    ],
}));

vi.mock("@services/UserSessionElevation", () => ({
    getUserSessionElevation: mocks.getUserSessionElevation,
}));

vi.mock("@views/Settings/Common/IdentityVerificationDialog", () => ({
    default: () => <div data-testid="identity-dialog" />,
}));

vi.mock("@views/Settings/Common/SecondFactorDialog", () => ({
    default: () => <div data-testid="second-factor-dialog" />,
}));

vi.mock("@views/Settings/Security/ChangePasswordDialog", () => ({
    default: mocks.changePasswordDialog,
}));

beforeEach(() => {
    mocks.changePasswordDialog.mockReset();
    mocks.changePasswordDialog.mockImplementation(({ flow, open }: { flow: string; open: boolean }) => (
        <div data-flow={flow} data-open={open ? "true" : "false"} data-testid="change-password-dialog" />
    ));
    mocks.fetchConfiguration.mockReset();
    mocks.fetchUserInfo.mockReset();
    mocks.getUserSessionElevation.mockReset();
    mocks.getUserSessionElevation.mockResolvedValue({ elevated: false });
});

it("renders user info and change password button", () => {
    render(<SecurityView />);
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getAllByText("Password").length).toBeGreaterThan(0);
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    expect(screen.getByText("Change Password")).toBeInTheDocument();
});

it("renders dialogs", () => {
    render(<SecurityView />);
    expect(screen.getByTestId("identity-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("second-factor-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("change-password-dialog")).toBeInTheDocument();
});

it("opens the change password dialog immediately while preparing elevation", async () => {
    render(<SecurityView />);

    fireEvent.click(screen.getByText("Change Password"));

    expect(screen.getByTestId("change-password-dialog")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("change-password-dialog")).toHaveAttribute("data-flow", "preparing");
    expect(mocks.getUserSessionElevation).toHaveBeenCalledTimes(1);

    await waitFor(() => {
        expect(screen.getByTestId("change-password-dialog")).toHaveAttribute("data-flow", "verifying");
    });
});

it("does not reopen verification when the preparing flow is cancelled", async () => {
    let resolveElevation = (_value: { elevated: boolean }) => {};
    mocks.getUserSessionElevation.mockReturnValue(
        new Promise((resolve) => {
            resolveElevation = resolve;
        }),
    );

    mocks.changePasswordDialog.mockImplementation(({ open, setClosed }: { open: boolean; setClosed: () => void }) =>
        <button
            data-open={open ? "true" : "false"}
            data-testid="change-password-dialog"
            onClick={setClosed}
            type="button"
        >
            change-password-dialog
        </button>
    );

    render(<SecurityView />);

    fireEvent.click(screen.getByText("Change Password"));
    expect(screen.getByTestId("change-password-dialog")).toHaveAttribute("data-open", "true");

    fireEvent.click(screen.getByTestId("change-password-dialog"));
    expect(screen.getByTestId("change-password-dialog")).toHaveAttribute("data-open", "false");

    resolveElevation({ elevated: false });

    await waitFor(() => {
        expect(screen.getByTestId("change-password-dialog")).toHaveAttribute("data-open", "false");
    });
});
