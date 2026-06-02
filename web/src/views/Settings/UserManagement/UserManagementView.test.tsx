import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { SecondFactorMethod } from "@models/Methods";
import type { UserInfo } from "@models/UserInfo";
import { createAdminUser, getAdminUserManagementCapabilities, listAdminUsers } from "@services/AdminUsers";
import { getUserSessionElevation } from "@services/UserSessionElevation";
import UserManagementView from "@views/Settings/UserManagement/UserManagementView";

const mockCreateErrorNotification = vi.fn();
const mockCreateInfoNotification = vi.fn();
const mockCreateSuccessNotification = vi.fn();
const mockCreateWarnNotification = vi.fn();
const mockUseUserInfoGET = vi.fn();

type SecondFactorDialogMockProps = {
    handleClosed: (approved: boolean, changed: boolean) => void;
    handleOpened: () => void;
    opening: boolean;
};

type IdentityVerificationDialogMockProps = {
    handleClosed: (approved: boolean) => void;
    handleOpened: () => void;
    opening: boolean;
};

const SecondFactorDialogMock = ({ handleClosed, opening }: SecondFactorDialogMockProps) =>
    opening ? (
        <div data-testid="second-factor-dialog">
            <button type="button" onClick={() => handleClosed(true, false)}>
                sf-success
            </button>
            <button type="button" onClick={() => handleClosed(false, false)}>
                sf-cancel
            </button>
        </div>
    ) : null;

const IdentityVerificationDialogMock = ({ handleClosed, opening }: IdentityVerificationDialogMockProps) =>
    opening ? (
        <div data-testid="identity-dialog">
            <button type="button" onClick={() => handleClosed(true)}>
                iv-success
            </button>
            <button type="button" onClick={() => handleClosed(false)}>
                iv-cancel
            </button>
        </div>
    ) : null;

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@contexts/NotificationsContext", () => ({
    useNotifications: () => ({
        createErrorNotification: mockCreateErrorNotification,
        createInfoNotification: mockCreateInfoNotification,
        createSuccessNotification: mockCreateSuccessNotification,
        createWarnNotification: mockCreateWarnNotification,
    }),
}));

vi.mock("@hooks/UserInfo", () => ({
    useUserInfoGET: () => mockUseUserInfoGET(),
}));

vi.mock("@services/AdminUsers", () => ({
    createAdminUser: vi.fn(),
    getAdminUser: vi.fn(),
    getAdminUserManagementCapabilities: vi.fn(),
    listAdminUsers: vi.fn(),
    resetAdminUserPassword: vi.fn(),
    updateAdminUser: vi.fn(),
}));

vi.mock("@services/UserSessionElevation", () => ({
    getUserSessionElevation: vi.fn(),
}));

vi.mock("@views/Settings/Common/SecondFactorDialog", () => ({
    default: (props: SecondFactorDialogMockProps) => <SecondFactorDialogMock {...props} />,
}));

vi.mock("@views/Settings/Common/IdentityVerificationDialog", () => ({
    default: (props: IdentityVerificationDialogMockProps) => <IdentityVerificationDialogMock {...props} />,
}));

beforeAll(() => {
    Object.defineProperty(globalThis, "matchMedia", {
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            addEventListener: vi.fn(),
            addListener: vi.fn(),
            dispatchEvent: vi.fn(),
            matches: false,
            media: query,
            onchange: null,
            removeEventListener: vi.fn(),
            removeListener: vi.fn(),
        })),
    });
});

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreateErrorNotification.mockReset();
    mockCreateInfoNotification.mockReset();
    mockCreateSuccessNotification.mockReset();
    mockCreateWarnNotification.mockReset();
    mockUseUserInfoGET.mockReturnValue([
        {
            display_name: "John Doe",
            emails: ["john@example.com"],
            has_duo: false,
            has_totp: true,
            has_webauthn: false,
            method: SecondFactorMethod.TOTP,
        } satisfies UserInfo,
        vi.fn(),
        false,
        null,
    ]);
    vi.mocked(createAdminUser).mockReset();
    vi.mocked(getAdminUserManagementCapabilities).mockReset();
    vi.mocked(getUserSessionElevation).mockReset();
    vi.mocked(listAdminUsers).mockReset();
    vi.mocked(getUserSessionElevation).mockResolvedValue({
        can_skip_second_factor: false,
        elevated: true,
        expires: 0,
        factor_knowledge: false,
        require_second_factor: true,
        skip_second_factor: false,
    });
    vi.mocked(getAdminUserManagementCapabilities).mockResolvedValue({
        can_create: true,
        can_list: true,
        can_notify: true,
        can_reset_password: true,
        can_update: true,
        supported: true,
    });
    vi.mocked(listAdminUsers).mockResolvedValue([]);
});

afterEach(() => {
    vi.restoreAllMocks();
});

it("shows an unsupported state when the backend does not support user management", async () => {
    vi.mocked(getAdminUserManagementCapabilities).mockResolvedValue({
        can_create: false,
        can_list: false,
        can_notify: false,
        can_reset_password: false,
        can_update: false,
        supported: false,
    });

    render(<UserManagementView />);

    expect(await screen.findByText("User Management Unsupported", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(
        screen.getByText("The configured authentication backend does not support administrative user management"),
    ).toBeInTheDocument();
});

it("shows listing unavailable instead of unsupported when only password reset is available", async () => {
    vi.mocked(getAdminUserManagementCapabilities).mockResolvedValue({
        can_create: false,
        can_list: false,
        can_notify: false,
        can_reset_password: true,
        can_update: false,
        supported: true,
    });

    render(<UserManagementView />);

    expect(await screen.findByText("User Listing Unavailable", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText("User Management Unsupported")).not.toBeInTheDocument();
});

it("renders users returned by the list endpoint", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
        {
            disabled: false,
            display_name: "Alice Admin",
            email: "alice@example.com",
            groups: ["admins", "users"],
            username: "alice",
        },
    ]);

    render(<UserManagementView />);

    await waitFor(() => {
        expect(listAdminUsers).toHaveBeenCalledWith("");
    });

    expect(await screen.findByText("alice", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Alice Admin")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
});

it("creates a user with notify enabled when email is provided", async () => {
    vi.mocked(createAdminUser).mockResolvedValue({
        notification: { status: "sent" },
    });

    render(<UserManagementView />);

    await waitFor(() => {
        expect(listAdminUsers).toHaveBeenCalledWith("");
    });

    fireEvent.click(screen.getByRole("button", { name: "Create User" }));

    const dialog = await screen.findByRole("dialog", {}, { timeout: 3000 });

    fireEvent.change(within(dialog).getByLabelText("Username *"), {
        target: { value: "new-user" },
    });
    fireEvent.change(within(dialog).getByLabelText("Display Name *"), {
        target: { value: "New User" },
    });
    fireEvent.change(within(dialog).getByLabelText("Email"), {
        target: { value: "new-user@example.com" },
    });
    fireEvent.change(within(dialog).getByLabelText("Password *"), {
        target: { value: "password123" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Create User" }));

    await waitFor(() => {
        expect(createAdminUser).toHaveBeenCalledWith({
            disabled: false,
            display_name: "New User",
            email: "new-user@example.com",
            groups: [],
            notify: true,
            password: "password123",
            username: "new-user",
        });
    });

    expect(mockCreateSuccessNotification).toHaveBeenCalledWith("User created successfully");
});

it("gates capabilities behind elevation and walks through second factor then identity verification", async () => {
    vi.mocked(getUserSessionElevation)
        .mockResolvedValueOnce({
            can_skip_second_factor: false,
            elevated: false,
            expires: 0,
            factor_knowledge: false,
            require_second_factor: true,
            skip_second_factor: false,
        })
        .mockResolvedValueOnce({
            can_skip_second_factor: false,
            elevated: false,
            expires: 0,
            factor_knowledge: false,
            require_second_factor: true,
            skip_second_factor: false,
        });

    render(<UserManagementView />);

    await screen.findByTestId("second-factor-dialog", {}, { timeout: 3000 });
    expect(getAdminUserManagementCapabilities).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "sf-success" }));

    await screen.findByTestId("identity-dialog", {}, { timeout: 3000 });
    expect(getAdminUserManagementCapabilities).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "iv-success" }));

    await waitFor(() => {
        expect(getAdminUserManagementCapabilities).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
        expect(listAdminUsers).toHaveBeenCalledWith("");
    });
});

it("cancels elevation without surfacing a capabilities error", async () => {
    vi.mocked(getUserSessionElevation)
        .mockResolvedValueOnce({
            can_skip_second_factor: false,
            elevated: false,
            expires: 0,
            factor_knowledge: false,
            require_second_factor: true,
            skip_second_factor: false,
        })
        .mockResolvedValueOnce({
            can_skip_second_factor: false,
            elevated: false,
            expires: 0,
            factor_knowledge: false,
            require_second_factor: true,
            skip_second_factor: false,
        });

    render(<UserManagementView />);

    await screen.findByTestId("second-factor-dialog", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "sf-cancel" }));

    await waitFor(() => {
        expect(getAdminUserManagementCapabilities).not.toHaveBeenCalled();
    });
    expect(screen.queryByText("Unable to Load User Management")).not.toBeInTheDocument();
    expect(
        screen.queryByText("Authelia could not load user management capabilities right now"),
    ).not.toBeInTheDocument();

    expect(screen.getByText("Verification")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await screen.findByTestId("second-factor-dialog", {}, { timeout: 3000 });
    expect(getAdminUserManagementCapabilities).not.toHaveBeenCalled();
});

it("cancels identity verification with a recovery action", async () => {
    vi.mocked(getUserSessionElevation)
        .mockResolvedValueOnce({
            can_skip_second_factor: false,
            elevated: false,
            expires: 0,
            factor_knowledge: false,
            require_second_factor: true,
            skip_second_factor: false,
        })
        .mockResolvedValueOnce({
            can_skip_second_factor: false,
            elevated: false,
            expires: 0,
            factor_knowledge: false,
            require_second_factor: true,
            skip_second_factor: false,
        });

    render(<UserManagementView />);

    await screen.findByTestId("second-factor-dialog", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "sf-success" }));
    await screen.findByTestId("identity-dialog", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "iv-cancel" }));

    await waitFor(() => {
        expect(screen.getByText("Verification")).toBeInTheDocument();
    });
    expect(getAdminUserManagementCapabilities).not.toHaveBeenCalled();
});

it("retries capability loading through the elevation preflight", async () => {
    vi.mocked(getUserSessionElevation).mockRejectedValueOnce(new Error("elevation unavailable")).mockResolvedValueOnce({
        can_skip_second_factor: false,
        elevated: false,
        expires: 0,
        factor_knowledge: false,
        require_second_factor: true,
        skip_second_factor: false,
    });

    render(<UserManagementView />);

    await screen.findByText("Unable to Load User Management", {}, { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByTestId("second-factor-dialog", {}, { timeout: 3000 });
    expect(getAdminUserManagementCapabilities).not.toHaveBeenCalled();
    expect(screen.queryByText("Unable to Load User Management")).not.toBeInTheDocument();
});
