import {
    createAdminUser,
    getAdminUser,
    getAdminUserManagementCapabilities,
    listAdminUsers,
    resetAdminUserPassword,
    updateAdminUser,
} from "@services/AdminUsers";
import { AdminUsersPath } from "@services/Api";
import { Get, PatchWithOptionalResponse, PostWithOptionalResponse, PutWithOptionalResponse } from "@services/Client";

vi.mock("@services/Api", () => ({
    AdminUsersPath: "/admin/users",
}));

vi.mock("@services/Client", () => ({
    Get: vi.fn(),
    PatchWithOptionalResponse: vi.fn(),
    PostWithOptionalResponse: vi.fn(),
    PutWithOptionalResponse: vi.fn(),
}));

it("calls PostWithOptionalResponse with the admin create user payload", async () => {
    const payload = {
        disabled: false,
        display_name: "Example User",
        email: "user@example.com",
        groups: ["admins", "users"],
        notify: true,
        password: "password",
        username: "example",
    };

    vi.mocked(PostWithOptionalResponse).mockResolvedValue(undefined);

    await createAdminUser(payload);

    expect(PostWithOptionalResponse).toHaveBeenCalledWith(AdminUsersPath, payload);
});

it("gets user management capabilities", async () => {
    vi.mocked(Get).mockResolvedValue({
        create: true,
        delete: false,
        list: true,
        read: true,
        reset_password: true,
        update: true,
    });

    await getAdminUserManagementCapabilities();

    expect(Get).toHaveBeenCalledWith(`${AdminUsersPath}/capabilities`, undefined);
});

it("treats reset-password-only capabilities as supported", async () => {
    vi.mocked(Get).mockResolvedValue({
        create: false,
        delete: false,
        list: false,
        read: false,
        reset_password: true,
        update: false,
    });

    await expect(getAdminUserManagementCapabilities()).resolves.toEqual({
        can_create: false,
        can_list: false,
        can_notify: false,
        can_reset_password: true,
        can_update: false,
        supported: true,
    });
});

it("does not expose raw notification errors from create responses", async () => {
    const payload = {
        disabled: false,
        display_name: "Example User",
        email: "user@example.com",
        groups: [],
        notify: true,
        password: "password",
        username: "example",
    };

    vi.mocked(PostWithOptionalResponse).mockResolvedValue({
        notification_error: "smtp password leaked: secret-token",
        notification_sent: false,
    });

    await expect(createAdminUser(payload)).resolves.toEqual({
        notification: {
            message: "User saved but email notification could not be sent",
            status: "failed",
        },
    });
});

it("lists users without a query", async () => {
    vi.mocked(Get).mockResolvedValue({ total: 0, users: [] });

    await listAdminUsers();

    expect(Get).toHaveBeenCalledWith(AdminUsersPath, undefined);
});

it("lists users with a query", async () => {
    vi.mocked(Get).mockResolvedValue({ total: 0, users: [] });

    await listAdminUsers("john doe");

    expect(Get).toHaveBeenCalledWith(`${AdminUsersPath}?search=john+doe`, undefined);
});

it("gets user detail", async () => {
    vi.mocked(Get).mockResolvedValue({ username: "john" });

    await getAdminUser("john/doe");

    expect(Get).toHaveBeenCalledWith(`${AdminUsersPath}/john%2Fdoe`, undefined);
});

it("updates a user", async () => {
    const payload = {
        disabled: true,
        display_name: "John Doe",
        email: "john@example.com",
        groups: ["admins"],
    };

    vi.mocked(PatchWithOptionalResponse).mockResolvedValue(undefined);

    await updateAdminUser("john/doe", payload);

    expect(PatchWithOptionalResponse).toHaveBeenCalledWith(`${AdminUsersPath}/john%2Fdoe`, payload, undefined);
});

it("resets a user password", async () => {
    const payload = {
        password: "new-password",
    };

    vi.mocked(PutWithOptionalResponse).mockResolvedValue(undefined);

    await resetAdminUserPassword("john/doe", payload);

    expect(PutWithOptionalResponse).toHaveBeenCalledWith(`${AdminUsersPath}/john%2Fdoe/password`, payload, undefined);
});
