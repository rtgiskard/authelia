import { createAdminUser } from "@services/AdminUsers";
import { AdminUsersPath } from "@services/Api";
import { PostWithOptionalResponse } from "@services/Client";

vi.mock("@services/Api", () => ({
    AdminUsersPath: "/admin/users",
}));

vi.mock("@services/Client", () => ({
    PostWithOptionalResponse: vi.fn(),
}));

it("calls PostWithOptionalResponse with the admin create user payload", async () => {
    const payload = {
        disabled: false,
        display_name: "Example User",
        email: "user@example.com",
        groups: ["admins", "users"],
        password: "password",
        username: "example",
    };

    vi.mocked(PostWithOptionalResponse).mockResolvedValue(undefined);

    await createAdminUser(payload);

    expect(PostWithOptionalResponse).toHaveBeenCalledWith(AdminUsersPath, payload);
});
