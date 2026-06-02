import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { SecondFactorMethod } from "@models/Methods";
import { PasswordPolicyMode } from "@models/PasswordPolicy";
import type { UserInfo } from "@models/UserInfo";
import {
    createAdminUser,
    deleteAdminUser,
    getAdminUser,
    getAdminUserManagementCapabilities,
    listAdminUsers,
    resetAdminUserPassword,
    updateAdminUser,
} from "@services/AdminUsers";
import { getPasswordPolicyConfiguration } from "@services/PasswordPolicyConfiguration";
import { type UserSessionElevation, getUserSessionElevation } from "@services/UserSessionElevation";
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
    deleteAdminUser: vi.fn(),
    getAdminUser: vi.fn(),
    getAdminUserManagementCapabilities: vi.fn(),
    listAdminUsers: vi.fn(),
    resetAdminUserPassword: vi.fn(),
    updateAdminUser: vi.fn(),
}));

vi.mock("@services/PasswordPolicyConfiguration", () => ({
    getPasswordPolicyConfiguration: vi.fn(),
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
    vi.mocked(deleteAdminUser).mockReset();
    vi.mocked(getAdminUser).mockReset();
    vi.mocked(getAdminUserManagementCapabilities).mockReset();
    vi.mocked(getPasswordPolicyConfiguration).mockReset();
    vi.mocked(getUserSessionElevation).mockReset();
    vi.mocked(listAdminUsers).mockReset();
    vi.mocked(resetAdminUserPassword).mockReset();
    vi.mocked(updateAdminUser).mockReset();
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
        can_delete: false,
        can_list: true,
        can_notify: true,
        can_reset_password: true,
        can_update: true,
        supported: true,
    });
    vi.mocked(listAdminUsers).mockResolvedValue([]);
    vi.mocked(deleteAdminUser).mockResolvedValue(undefined);
    vi.mocked(getAdminUser).mockResolvedValue({
        disabled: false,
        display_name: "Alice Admin",
        email: "alice@example.com",
        groups: ["admins"],
        username: "alice",
    });
    vi.mocked(getPasswordPolicyConfiguration).mockResolvedValue({
        max_length: 0,
        min_length: 8,
        min_score: 0,
        mode: PasswordPolicyMode.Disabled,
        require_lowercase: false,
        require_number: false,
        require_special: false,
        require_uppercase: false,
    });
    vi.mocked(resetAdminUserPassword).mockResolvedValue(undefined);
    vi.mocked(updateAdminUser).mockResolvedValue(undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

it("shows an unsupported state when the backend does not support user management", async () => {
    vi.mocked(getAdminUserManagementCapabilities).mockResolvedValue({
        can_create: false,
        can_delete: false,
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
        can_delete: false,
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
    fireEvent.change(within(dialog).getByLabelText("Email *"), {
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

it("requires an email address when creating a user", async () => {
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
    fireEvent.change(within(dialog).getByLabelText("Password *"), {
        target: { value: "password123" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Create User" }));

    expect(mockCreateErrorNotification).toHaveBeenCalledWith("Email is required");
    expect(createAdminUser).not.toHaveBeenCalled();
});

it("creates a user with a generated password notification payload", async () => {
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
        target: { value: "generated-user" },
    });
    fireEvent.change(within(dialog).getByLabelText("Display Name *"), {
        target: { value: "Generated User" },
    });
    fireEvent.change(within(dialog).getByLabelText("Email *"), {
        target: { value: "generated@example.com" },
    });
    fireEvent.click(within(dialog).getByLabelText("Generate random password and email it to the user"));

    expect(within(dialog).queryByLabelText("Password *")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Create User" }));

    await waitFor(() => {
        expect(createAdminUser).toHaveBeenCalledWith({
            disabled: false,
            display_name: "Generated User",
            email: "generated@example.com",
            generate_password: true,
            groups: [],
            notify: true,
            username: "generated-user",
        });
    });
});

it("shows duplicate identity feedback while creating a user", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
        {
            disabled: false,
            display_name: "Alice Admin",
            email: "alice@example.com",
            groups: ["admins"],
            username: "alice",
        },
    ]);

    render(<UserManagementView />);

    await screen.findByText("alice", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Create User" }));

    const dialog = await screen.findByRole("dialog", {}, { timeout: 3000 });

    fireEvent.change(within(dialog).getByLabelText("Username *"), {
        target: { value: "alice" },
    });
    fireEvent.change(within(dialog).getByLabelText("Email *"), {
        target: { value: "alice@example.com" },
    });

    expect(await within(dialog).findByText("Username is already in use")).toBeInTheDocument();
    expect(within(dialog).getByText("Email is already in use")).toBeInTheDocument();
});

it("requires an email address when editing a user", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
        {
            disabled: false,
            display_name: "Alice Admin",
            email: "alice@example.com",
            groups: ["admins"],
            username: "alice",
        },
    ]);

    render(<UserManagementView />);

    await screen.findByText("alice", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Edit User alice" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit User" }, { timeout: 3000 });
    const emailField = within(dialog).getByLabelText("Email *");

    fireEvent.change(emailField, { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    expect(mockCreateErrorNotification).toHaveBeenCalledWith("Email is required");
    expect(updateAdminUser).not.toHaveBeenCalled();
    expect(emailField).toHaveAttribute("aria-invalid", "true");
});

it("shows duplicate email feedback while editing a user", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
        {
            disabled: false,
            display_name: "Alice Admin",
            email: "alice@example.com",
            groups: ["admins"],
            username: "alice",
        },
        {
            disabled: false,
            display_name: "Bob Admin",
            email: "bob@example.com",
            groups: ["admins"],
            username: "bob",
        },
    ]);

    render(<UserManagementView />);

    await screen.findByText("alice", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Edit User alice" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit User" }, { timeout: 3000 });
    fireEvent.change(within(dialog).getByLabelText("Email *"), {
        target: { value: "bob@example.com" },
    });

    expect(await within(dialog).findByText("Email is already in use")).toBeInTheDocument();
});

it("shows verification without opening elevation dialogs when elevation is required on initial render", async () => {
    vi.mocked(getUserSessionElevation).mockResolvedValueOnce({
        can_skip_second_factor: false,
        elevated: false,
        expires: 0,
        factor_knowledge: false,
        require_second_factor: true,
        skip_second_factor: false,
    });

    render(<UserManagementView />);

    expect(await screen.findByText("Verification", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByTestId("second-factor-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("identity-dialog")).not.toBeInTheDocument();
    expect(getAdminUserManagementCapabilities).not.toHaveBeenCalled();
    expect(listAdminUsers).not.toHaveBeenCalled();
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

    expect(await screen.findByText("Verification", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByTestId("second-factor-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("identity-dialog")).not.toBeInTheDocument();
    expect(getAdminUserManagementCapabilities).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

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

    expect(await screen.findByText("Verification", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByTestId("second-factor-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

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

    expect(await screen.findByText("Verification", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByTestId("second-factor-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

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

it("hides delete actions and uses clearer sign-in labels when delete is unavailable", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
        {
            disabled: false,
            display_name: "Alice Admin",
            email: "alice@example.com",
            groups: ["admins"],
            username: "alice",
        },
    ]);

    render(<UserManagementView />);

    await screen.findByText("alice", {}, { timeout: 3000 });

    expect(screen.getByRole("button", { name: "Disable User alice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete User alice" })).not.toBeInTheDocument();
});

it("toggles a user with a disabled-only update payload", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
        {
            disabled: false,
            display_name: "Alice Admin",
            email: "",
            groups: ["admins"],
            username: "alice",
        },
    ]);

    render(<UserManagementView />);

    await screen.findByText("alice", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Disable User alice" }));

    const dialog = await screen.findByRole("dialog", {}, { timeout: 3000 });
    fireEvent.click(within(dialog).getByRole("button", { name: "Disable User" }));

    await waitFor(() => {
        expect(updateAdminUser).toHaveBeenCalledWith("alice", { disabled: true });
    });
});

it("uses client-side pagination for listed users", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue(
        Array.from({ length: 21 }, (_value, index) => ({
            disabled: false,
            display_name: `User ${index + 1}`,
            email: `user-${index + 1}@example.com`,
            groups: [],
            username: `user-${String(index + 1).padStart(2, "0")}`,
        })),
    );

    render(<UserManagementView />);

    expect(await screen.findByText("user-01", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("user-20")).toBeInTheDocument();
    expect(screen.queryByText("user-21")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Go to next page"));

    expect(await screen.findByText("user-21", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText("user-01")).not.toBeInTheDocument();
});

it("sorts users by status from the status header", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
        {
            disabled: false,
            display_name: "Alice Admin",
            email: "alice@example.com",
            groups: ["admins"],
            username: "alice",
        },
        {
            disabled: true,
            display_name: "Bob Admin",
            email: "bob@example.com",
            groups: ["admins"],
            username: "bob",
        },
    ]);

    render(<UserManagementView />);

    await screen.findByText("alice", {}, { timeout: 3000 });
    expect(within(screen.getAllByRole("row")[1]).getByText("alice")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Status" }));

    expect(within(screen.getAllByRole("row")[1]).getByText("bob")).toBeInTheDocument();
});

it("resets a user password with a generated password notification payload", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
        {
            disabled: false,
            display_name: "Alice Admin",
            email: "alice@example.com",
            groups: ["admins"],
            username: "alice",
        },
    ]);

    render(<UserManagementView />);

    await screen.findByText("alice", {}, { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: "Reset Password alice" }));

    const dialog = await screen.findByRole("dialog", { name: "Reset Password" }, { timeout: 3000 });

    fireEvent.click(within(dialog).getByLabelText("Generate random password and email it to the user"));
    expect(within(dialog).queryByLabelText("New Password *")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Reset Password" }));

    await waitFor(() => {
        expect(resetAdminUserPassword).toHaveBeenCalledWith("alice", {
            generate_password: true,
            notify: true,
        });
    });
});

it("shows password-policy feedback for weak password reset failures", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
        {
            disabled: false,
            display_name: "Alice Admin",
            email: "alice@example.com",
            groups: ["admins"],
            username: "alice",
        },
    ]);
    vi.mocked(resetAdminUserPassword).mockRejectedValue({
        isAxiosError: true,
        response: { status: 400 },
    });

    render(<UserManagementView />);

    await screen.findByText("alice", {}, { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: "Reset Password alice" }));

    const dialog = await screen.findByRole("dialog", { name: "Reset Password" }, { timeout: 3000 });
    const passwordField = within(dialog).getByLabelText("New Password *");

    fireEvent.change(passwordField, {
        target: { value: "weak" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset Password" }));

    await waitFor(() => {
        expect(mockCreateErrorNotification).toHaveBeenCalledWith(
            "Your supplied password does not meet the password policy requirements",
        );
    });
    expect(passwordField).toHaveAttribute("aria-invalid", "true");
});

it("shows delete action when supported and deletes after confirmation", async () => {
    vi.mocked(getAdminUserManagementCapabilities).mockResolvedValue({
        can_create: true,
        can_delete: true,
        can_list: true,
        can_notify: true,
        can_reset_password: true,
        can_update: true,
        supported: true,
    });
    vi.mocked(listAdminUsers).mockResolvedValue([
        {
            disabled: false,
            display_name: "Alice Admin",
            email: "alice@example.com",
            groups: ["admins"],
            username: "alice",
        },
    ]);

    render(<UserManagementView />);

    await screen.findByText("alice", {}, { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: "Delete User alice" }));

    const dialog = await screen.findByRole("dialog", { name: "Delete {{username}}" }, { timeout: 3000 });

    expect(
        within(dialog).getByText(
            "This permanently deletes the user from the configured authentication backend and cannot be undone",
        ),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete User" }));

    await waitFor(() => {
        expect(deleteAdminUser).toHaveBeenCalledWith("alice");
    });
    expect(mockCreateSuccessNotification).toHaveBeenCalledWith("User deleted successfully");
    await waitFor(() => {
        expect(listAdminUsers).toHaveBeenCalledTimes(2);
    });
});

it("keeps a visible state between second-factor success and identity verification", async () => {
    let resolveRefresh: (value: UserSessionElevation) => void = () => {};
    const pendingRefresh = new Promise<UserSessionElevation>((resolve) => {
        resolveRefresh = resolve;
    });

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
        })
        .mockReturnValueOnce(pendingRefresh);

    render(<UserManagementView />);

    expect(await screen.findByText("Verification", {}, { timeout: 3000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByTestId("second-factor-dialog", {}, { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: "sf-success" }));

    expect(await screen.findByText("Loading User Management", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Checking which user management features are available")).toBeInTheDocument();

    resolveRefresh({
        can_skip_second_factor: false,
        elevated: false,
        expires: 0,
        factor_knowledge: false,
        require_second_factor: true,
        skip_second_factor: false,
    });

    await screen.findByTestId("identity-dialog", {}, { timeout: 3000 });
});
