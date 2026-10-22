import {
    createAdminUser,
    getAdminUserManagementCapabilities,
    listAdminUsers,
    resetAdminUserPassword,
} from "@services/AdminUsers";
import { Get, PostWithOptionalResponse, PutWithOptionalResponse } from "@services/Client";

vi.mock("@services/Api", () => ({
    AdminUsersPath: "/admin/users",
}));

vi.mock("@services/Client", () => ({
    DeleteWithOptionalResponse: vi.fn(),
    Get: vi.fn(),
    PatchWithOptionalResponse: vi.fn(),
    PostWithOptionalResponse: vi.fn(),
    PutWithOptionalResponse: vi.fn(),
}));

it("maps password-link creation to a sent notification", async () => {
    const payload = {
        disabled: false,
        display_name: "Link User",
        email: "link@example.com",
        groups: [],
        notify: true,
        send_password_link: true,
        username: "link-user",
    };

    vi.mocked(PostWithOptionalResponse).mockResolvedValue({
        notification_sent: true,
    });

    await expect(createAdminUser(payload)).resolves.toEqual({
        notification: { status: "sent" },
    });
});

it("maps user management capabilities", async () => {
    vi.mocked(Get).mockResolvedValue({
        create: true,
        delete: true,
        list: true,
        read: true,
        reset_password: true,
        update: true,
    });

    await expect(getAdminUserManagementCapabilities()).resolves.toEqual({
        can_create: true,
        can_delete: true,
        can_list: true,
        can_notify: true,
        can_reset_password: true,
        can_update: true,
        supported: true,
    });
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
        can_delete: false,
        can_list: false,
        can_notify: false,
        can_reset_password: true,
        can_update: false,
        supported: true,
    });
});

it("treats delete-only capabilities as supported", async () => {
    vi.mocked(Get).mockResolvedValue({
        create: false,
        delete: true,
        list: false,
        read: false,
        reset_password: false,
        update: false,
    });

    await expect(getAdminUserManagementCapabilities()).resolves.toEqual({
        can_create: false,
        can_delete: true,
        can_list: false,
        can_notify: false,
        can_reset_password: false,
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
            status: "failed",
        },
    });
});

it("normalizes null users from the list endpoint", async () => {
    vi.mocked(Get).mockResolvedValue({ total: 0, users: null });

    await expect(listAdminUsers("missing")).resolves.toEqual([]);
});

it("resets a user password with password link notification", async () => {
    const payload = {
        send_password_link: true,
    };

    vi.mocked(PutWithOptionalResponse).mockResolvedValue({
        notification_sent: true,
    });

    await expect(resetAdminUserPassword("john/doe", payload)).resolves.toEqual({
        notification: { status: "sent" },
    });
});

it("maps password reset notification failures without exposing raw errors", async () => {
    const payload = {
        send_password_link: true,
    };

    vi.mocked(PutWithOptionalResponse).mockResolvedValue({
        notification_error: "smtp secret leaked",
        notification_sent: false,
    });

    await expect(resetAdminUserPassword("john/doe", payload)).resolves.toEqual({
        notification: {
            status: "failed",
        },
    });
});

it("maps skipped safety mail to a stable status without exposing the service reason", async () => {
    vi.mocked(PutWithOptionalResponse).mockResolvedValue({
        notification_reason: "No email address is configured",
        notification_sent: false,
    });

    await expect(resetAdminUserPassword("alice", { password: "password123" })).resolves.toEqual({
        notification: { status: "skipped" },
    });
    expect(PutWithOptionalResponse).toHaveBeenLastCalledWith(
        "/admin/users/alice/password",
        { password: "password123" },
        undefined,
    );
});

it("preserves successful mutation with a stable link revocation warning", async () => {
    vi.mocked(PutWithOptionalResponse).mockResolvedValue({
        notification_sent: true,
        reset_links_revocation_error: "storage credentials must not be exposed",
    });

    await expect(resetAdminUserPassword("alice", { password: "password123" })).resolves.toEqual({
        notification: { status: "sent" },
        reset_links_revocation_failed: true,
    });
});
