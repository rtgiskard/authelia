import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import UserManagementView from "@views/Settings/UserManagement/UserManagementView";

const mockCreateErrorNotification = vi.fn();
const mockCreateInfoNotification = vi.fn();
const mockCreateSuccessNotification = vi.fn();
const mockCreateWarnNotification = vi.fn();

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

vi.mock("@services/AdminUsers", () => ({
    createAdminUser: vi.fn(),
    getAdminUser: vi.fn(),
    getAdminUserManagementCapabilities: vi.fn(),
    listAdminUsers: vi.fn(),
    resetAdminUserPassword: vi.fn(),
    updateAdminUser: vi.fn(),
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
});

afterEach(() => {
    vi.restoreAllMocks();
});

it("shows an unsupported state when the backend does not support user management", async () => {
    const { getAdminUserManagementCapabilities } = await import("@services/AdminUsers");

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

it("renders users returned by the list endpoint", async () => {
    const { getAdminUserManagementCapabilities, listAdminUsers } = await import("@services/AdminUsers");

    vi.mocked(getAdminUserManagementCapabilities).mockResolvedValue({
        can_create: true,
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
    const { createAdminUser, getAdminUserManagementCapabilities, listAdminUsers } =
        await import("@services/AdminUsers");

    vi.mocked(getAdminUserManagementCapabilities).mockResolvedValue({
        can_create: true,
        can_list: true,
        can_notify: true,
        can_reset_password: true,
        can_update: true,
        supported: true,
    });
    vi.mocked(listAdminUsers).mockResolvedValue([]);
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
