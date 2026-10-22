import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createInstance } from "i18next";

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

import enSettings from "../../../../../internal/server/locales/en/settings.json";
import zhCNSettings from "../../../../../internal/server/locales/zh-CN/settings.json";

const mockCreateErrorNotification = vi.fn();
const mockCreateInfoNotification = vi.fn();
const mockCreateSuccessNotification = vi.fn();
const mockCreateWarnNotification = vi.fn();
const mockUseUserInfoGET = vi.fn();
const mockTranslate = vi.fn<(key: string, values?: Record<string, unknown>) => string>((key) => key);

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
            <button type="button" onClick={() => handleClosed(true, true)}>
                sf-authenticated
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
    useTranslation: () => ({ t: mockTranslate }),
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

beforeEach(() => {
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
    document.body.dataset.resetpassword = "true";
    document.body.dataset.resetpasswordcustomurl = "";
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockTranslate.mockReset();
    mockTranslate.mockImplementation((key) => key);
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

it.each([
    { isMobile: false, label: "Added Time", language: "en", unknown: "Unknown" },
    { isMobile: true, label: "Added Time", language: "en", unknown: "Unknown" },
    { isMobile: false, label: "添加时间", language: "zh-CN", unknown: "未知" },
    { isMobile: true, label: "添加时间", language: "zh-CN", unknown: "未知" },
])(
    "shows localized added time and legacy unknown dates (mobile: $isMobile, locale: $language)",
    async ({ isMobile, label, language, unknown }) => {
        const i18n = createInstance();
        await i18n.init({
            defaultNS: "settings",
            fallbackLng: "en",
            lng: language,
            resources: {
                en: { settings: enSettings },
                "zh-CN": { settings: zhCNSettings },
            },
        });
        mockTranslate.mockImplementation((key, values) => i18n.t(key, values));

        const media = globalThis.matchMedia("(max-width: 899px)");
        vi.spyOn(globalThis, "matchMedia").mockReturnValue({ ...media, matches: isMobile });

        const createdAt = "2026-10-12T06:45:00Z";
        vi.mocked(listAdminUsers).mockResolvedValue([
            {
                created_at: createdAt,
                disabled: false,
                display_name: "Alice Admin",
                email: "alice@example.com",
                groups: ["admins"],
                username: "alice",
            },
            {
                disabled: false,
                display_name: "Legacy User",
                email: "legacy@example.com",
                groups: [],
                username: "legacy",
            },
            {
                created_at: null,
                disabled: false,
                display_name: "Unknown User",
                email: "unknown@example.com",
                groups: [],
                username: "unknown",
            },
        ]);

        render(<UserManagementView />);

        await screen.findByText("alice", {}, { timeout: 3000 });

        const expectedDate = new Intl.DateTimeFormat(language, {
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            month: "long",
            year: "numeric",
        }).format(new Date(createdAt));
        expect(screen.getByText(expectedDate)).toHaveAttribute("datetime", createdAt);
        expect(screen.getAllByText(unknown)).toHaveLength(2);
        expect(screen.getAllByText(label)).toHaveLength(isMobile ? 3 : 1);

        if (isMobile) {
            expect(screen.queryByRole("table")).not.toBeInTheDocument();
        } else {
            expect(screen.getByRole("columnheader", { name: label })).toBeInTheDocument();
        }
    },
);

it("shows an empty state when search has no matching users", async () => {
    vi.mocked(listAdminUsers)
        .mockResolvedValueOnce([
            {
                disabled: false,
                display_name: "Alice Admin",
                email: "alice@example.com",
                groups: ["admins"],
                username: "alice",
            },
        ])
        .mockResolvedValueOnce([]);

    render(<UserManagementView />);

    expect(await screen.findByText("alice", {}, { timeout: 3000 })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search Users"), {
        target: { value: "missing-user" },
    });

    await waitFor(() => {
        expect(listAdminUsers).toHaveBeenCalledWith("missing-user");
    });

    expect(await screen.findByText("No Matching Users", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("No users matched your search")).toBeInTheDocument();
});

it("creates a user with notifications disabled by default when email is provided", async () => {
    vi.mocked(createAdminUser).mockResolvedValue({
        notification: { status: "sent" },
    });

    render(<UserManagementView />);

    await waitFor(() => {
        expect(listAdminUsers).toHaveBeenCalledWith("");
    });

    fireEvent.click(screen.getByRole("button", { name: "Create User" }));

    const dialog = await screen.findByRole("dialog", {}, { timeout: 3000 });
    expect(within(dialog).queryByLabelText("Added Time")).not.toBeInTheDocument();

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
            notify: false,
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

it("creates a user with a password link notification payload", async () => {
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
        target: { value: "link-user" },
    });
    fireEvent.change(within(dialog).getByLabelText("Display Name *"), {
        target: { value: "Link User" },
    });
    fireEvent.change(within(dialog).getByLabelText("Email *"), {
        target: { value: "link@example.com" },
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Send a password setup link to the user" }));

    expect(within(dialog).queryByLabelText("Password *")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Create User" }));

    await waitFor(() => {
        expect(createAdminUser).toHaveBeenCalledWith({
            disabled: false,
            display_name: "Link User",
            email: "link@example.com",
            groups: [],
            notify: true,
            send_password_link: true,
            username: "link-user",
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

it("keeps the creation timestamp read-only and out of edit payloads", async () => {
    const user = {
        created_at: "2026-10-12T06:45:00Z",
        disabled: false,
        display_name: "Alice Admin",
        email: "alice@example.com",
        groups: ["admins"],
        username: "alice",
    };
    vi.mocked(listAdminUsers).mockResolvedValue([user]);
    vi.mocked(getAdminUser).mockResolvedValue(user);

    render(<UserManagementView />);

    await screen.findByText("alice", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Edit User alice" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit User" }, { timeout: 3000 });
    const displayName = await within(dialog).findByDisplayValue("Alice Admin");
    expect(within(dialog).queryByLabelText("Added Time")).not.toBeInTheDocument();
    fireEvent.change(displayName, { target: { value: "Alice Updated" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
        expect(updateAdminUser).toHaveBeenCalledWith("alice", {
            disabled: false,
            display_name: "Alice Updated",
            email: "alice@example.com",
            groups: ["admins"],
        });
    });
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

it.each([true, false])("does not switch a completed 2FA attempt to email (accepted: %s)", async (accepted) => {
    const pending: UserSessionElevation = {
        can_skip_second_factor: true,
        elevated: false,
        expires: 0,
        factor_knowledge: true,
        require_second_factor: false,
        skip_second_factor: false,
    };
    vi.mocked(getUserSessionElevation)
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce({ ...pending, skip_second_factor: accepted });

    render(<UserManagementView />);
    await screen.findByText("Verification");
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    fireEvent.click(await screen.findByText("sf-authenticated"));
    await waitFor(() => expect(screen.queryByTestId("second-factor-dialog")).not.toBeInTheDocument());

    if (accepted) {
        await screen.findByText("No Users Yet");
    } else {
        await screen.findByText("Verification");
        expect(getAdminUserManagementCapabilities).not.toHaveBeenCalled();
    }
    expect(screen.queryByTestId("identity-dialog")).not.toBeInTheDocument();
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
            created_at: "2026-10-12T06:45:00Z",
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

it("sorts by username and creation time with unknown dates last and stable ties", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue(
        [
            { created_at: "2026-01-01T00:00:00Z", username: "zulu" },
            { created_at: null, username: "alpha" },
            { created_at: "2026-02-01T00:00:00Z", username: "beta" },
            { created_at: "2026-02-01T08:00:00+08:00", username: "charlie" },
            { username: "delta" },
        ].map((user) => ({
            disabled: false,
            display_name: user.username,
            email: `${user.username}@example.com`,
            groups: [],
            ...user,
        })),
    );
    render(<UserManagementView />);
    await screen.findByRole("button", { name: "Added Time" });
    const names = () =>
        screen
            .getAllByRole("row")
            .slice(1)
            .map((row) => row.querySelector("td")?.textContent);
    fireEvent.click(screen.getByRole("button", { name: "Added Time" }));
    expect(names()).toEqual(["beta", "charlie", "zulu", "alpha", "delta"]);
    expect(screen.getByRole("columnheader", { name: "Added Time" })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: "Added Time" }));
    expect(names()).toEqual(["zulu", "beta", "charlie", "alpha", "delta"]);
    fireEvent.click(screen.getByRole("button", { name: "Username" }));
    expect(names()).toEqual(["alpha", "beta", "charlie", "delta", "zulu"]);
    expect(screen.getByRole("columnheader", { name: "Added Time" })).toHaveAttribute("aria-sort", "none");
    fireEvent.click(screen.getByRole("button", { name: "Username" }));
    expect(names()).toEqual(["zulu", "delta", "charlie", "beta", "alpha"]);
});

it("sorts the full collection before pagination and returns to the first page", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue(
        Array.from({ length: 21 }, (_, index) => ({
            created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
            disabled: false,
            display_name: `User ${index}`,
            email: `user${index}@example.com`,
            groups: [],
            username: `user-${String(index).padStart(2, "0")}`,
        })),
    );
    render(<UserManagementView />);
    await screen.findByText("user-00");
    fireEvent.click(screen.getByLabelText("Go to next page"));
    expect(await screen.findByText("user-20")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Added Time" }));
    expect(within(screen.getAllByRole("row")[1]).getByText("user-20")).toBeInTheDocument();
    expect(screen.getByText("user-01")).toBeInTheDocument();
    expect(screen.queryByText("user-00")).not.toBeInTheDocument();
});

it("resets a user password with a password link notification payload", async () => {
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

    let dialog = await screen.findByRole("dialog", { name: "Reset Password" }, { timeout: 3000 });

    expect(within(dialog).getByText("alice")).toBeInTheDocument();
    await within(dialog).findByText("alice@example.com");
    expect(within(dialog).getByRole("radio", { name: "Set password directly" })).toBeChecked();
    fireEvent.change(within(dialog).getByLabelText("New Password *"), { target: { value: "password123" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Send Reset Link" }));
    expect(within(dialog).getByRole("radio", { name: "Send Reset Link" })).toBeChecked();
    expect(within(dialog).queryByLabelText("New Password *")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Set password directly" }));
    expect(within(dialog).getByLabelText("New Password *")).toHaveValue("");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Send Reset Link" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Password alice" }));
    dialog = await screen.findByRole("dialog", { name: "Reset Password" });
    await within(dialog).findByText("alice@example.com");
    expect(within(dialog).getByRole("radio", { name: "Set password directly" })).toBeChecked();
    expect(within(dialog).getByLabelText("New Password *")).toHaveValue("");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Send Reset Link" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() => {
        expect(resetAdminUserPassword).toHaveBeenCalledWith("alice", {
            send_password_link: true,
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

it.each(["sent", "failed", "skipped"] as const)(
    "translates manual reset delivery status %s separately from mutation",
    async (status) => {
        vi.mocked(listAdminUsers).mockResolvedValue([
            {
                disabled: false,
                display_name: "Alice Admin",
                email: "alice@example.com",
                groups: [],
                username: "alice",
            },
        ]);
        vi.mocked(resetAdminUserPassword).mockResolvedValue({ notification: { status } });
        mockTranslate.mockImplementation((key) => `translated:${key}`);
        render(<UserManagementView />);
        await screen.findByText("alice");
        fireEvent.click(screen.getByRole("button", { name: "translated:Reset Password alice" }));
        const dialog = await screen.findByRole("dialog", { name: "translated:Reset Password" });
        fireEvent.change(within(dialog).getByLabelText("translated:New Password *"), {
            target: { value: "password123" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "translated:Reset Password" }));
        await waitFor(() => expect(resetAdminUserPassword).toHaveBeenCalledWith("alice", { password: "password123" }));
        await waitFor(() =>
            expect(mockCreateSuccessNotification).toHaveBeenCalledWith("translated:Password reset successfully"),
        );
        const notification =
            status === "sent"
                ? mockCreateSuccessNotification
                : status === "failed"
                  ? mockCreateWarnNotification
                  : mockCreateInfoNotification;
        const key =
            status === "sent"
                ? "Email notification sent"
                : status === "failed"
                  ? "Email notification could not be sent"
                  : "Email notification was skipped";
        expect(notification).toHaveBeenCalledWith(`translated:${key}`);
    },
);

it("reports a changed password and translates an outstanding-link invalidation warning", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
        {
            disabled: false,
            display_name: "Alice Admin",
            email: "alice@example.com",
            groups: [],
            username: "alice",
        },
    ]);
    vi.mocked(resetAdminUserPassword).mockResolvedValue({
        notification: { status: "sent" },
        reset_links_revocation_failed: true,
    });
    mockTranslate.mockImplementation((key) => `translated:${key}`);
    render(<UserManagementView />);
    await screen.findByText("alice");
    fireEvent.click(screen.getByRole("button", { name: "translated:Reset Password alice" }));
    const dialog = await screen.findByRole("dialog", { name: "translated:Reset Password" });
    fireEvent.change(within(dialog).getByLabelText("translated:New Password *"), { target: { value: "password123" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "translated:Reset Password" }));
    await waitFor(() =>
        expect(mockCreateSuccessNotification).toHaveBeenCalledWith("translated:Password reset successfully"),
    );
    expect(mockCreateWarnNotification).toHaveBeenCalledWith(
        "translated:Password changed, but existing reset links could not be invalidated",
    );
});

it.each(["sent", "failed", "skipped"] as const)(
    "reports link reset delivery %s without claiming password mutation",
    async (status) => {
        vi.mocked(listAdminUsers).mockResolvedValue([
            {
                disabled: false,
                display_name: "Alice Admin",
                email: "alice@example.com",
                groups: [],
                username: "alice",
            },
        ]);
        vi.mocked(resetAdminUserPassword).mockResolvedValue({ notification: { status } });
        render(<UserManagementView />);
        await screen.findByText("alice");
        fireEvent.click(screen.getByRole("button", { name: "Reset Password alice" }));
        const dialog = await screen.findByRole("dialog", { name: "Reset Password" });
        fireEvent.click(within(dialog).getByRole("radio", { name: "Send Reset Link" }));
        fireEvent.click(within(dialog).getByRole("button", { name: "Send Reset Link" }));
        await waitFor(() => expect(resetAdminUserPassword).toHaveBeenCalledWith("alice", { send_password_link: true }));
        await waitFor(() =>
            expect(status === "sent" ? mockCreateSuccessNotification : mockCreateWarnNotification).toHaveBeenCalledWith(
                status === "sent"
                    ? "Password setup link sent"
                    : "Password setup link could not be sent. The password was not changed",
            ),
        );
        expect(mockCreateSuccessNotification).not.toHaveBeenCalledWith("Password reset successfully");
    },
);

it.each(["disabled", "custom"])("disables link mode for %s password reset configuration", async (mode) => {
    document.body.dataset.resetpassword = mode === "disabled" ? "false" : "true";
    document.body.dataset.resetpasswordcustomurl = mode === "custom" ? "https://reset.example.com" : "";
    vi.mocked(listAdminUsers).mockResolvedValue([
        {
            disabled: false,
            display_name: "Alice Admin",
            email: "alice@example.com",
            groups: [],
            username: "alice",
        },
    ]);
    render(<UserManagementView />);
    await screen.findByText("alice");
    fireEvent.click(screen.getByRole("button", { name: "Create User" }));
    let dialog = await screen.findByRole("dialog");
    expect(
        within(dialog).queryByRole("checkbox", { name: "Send a password setup link to the user" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Password alice" }));
    dialog = await screen.findByRole("dialog", { name: "Reset Password" });
    expect(within(dialog).getByRole("radio", { name: "Send Reset Link" })).toBeDisabled();
});
