import axios from "axios";

import { hasServiceError, toData, validateStatusOneTimeCode } from "@services/Api";
import { PostWithOptionalResponseRateLimited } from "@services/Client";
import {
    deleteUserSessionElevation,
    generateUserSessionElevation,
    getUserSessionElevation,
    verifyUserSessionElevation,
} from "@services/UserSessionElevation";

vi.mock("axios");
vi.mock("@services/Api", () => ({
    hasServiceError: vi.fn(),
    toData: vi.fn(),
    UserSessionElevationPath: "/user/elevation",
    validateStatusOneTimeCode: vi.fn(),
}));
vi.mock("@services/Client", () => ({
    PostWithOptionalResponseRateLimited: vi.fn(),
}));

it("gets user session elevation successfully", async () => {
    const mockRes = { data: { data: "elevation", status: "OK" }, status: 200 };
    vi.mocked(axios).mockResolvedValue(mockRes);
    vi.mocked(hasServiceError).mockReturnValue({ errored: false, message: null });
    vi.mocked(toData).mockReturnValue("elevation");

    const result = await getUserSessionElevation();
    expect(axios).toHaveBeenCalledWith({
        method: "GET",
        url: "/user/elevation",
    });
    expect(result).toBe("elevation");
});

it("gets user session elevation with error", async () => {
    const mockRes = { data: { message: "error", status: "KO" }, status: 400 };
    vi.mocked(axios).mockResolvedValue(mockRes);
    vi.mocked(hasServiceError).mockReturnValue({
        errored: true,
        message: "error",
    });

    await expect(getUserSessionElevation()).rejects.toThrow(
        "Failed POST to /user/elevation. Code: 400. Message: error",
    );
});

it("generates user session elevation successfully", async () => {
    const response = { data: { delete_id: "del-123" }, limited: false, retryAfter: 0 };

    vi.mocked(PostWithOptionalResponseRateLimited).mockResolvedValue(response);

    const result = await generateUserSessionElevation();
    expect(PostWithOptionalResponseRateLimited).toHaveBeenCalledWith("/user/elevation");
    expect(result).toBe(response);
});

it("generates user session elevation with error", async () => {
    vi.mocked(PostWithOptionalResponseRateLimited).mockRejectedValue(new Error("error"));

    await expect(generateUserSessionElevation()).rejects.toThrow("error");
});

it("verifies user session elevation successfully", async () => {
    const mockRes = { data: { status: "OK" }, status: 200 };
    vi.mocked(axios).mockResolvedValue(mockRes);

    const result = await verifyUserSessionElevation("otc123");
    expect(axios).toHaveBeenCalledWith({
        data: { otc: "otc123" },
        method: "PUT",
        url: "/user/elevation",
        validateStatus: validateStatusOneTimeCode,
    });
    expect(result).toBe(true);
});

it("verifies user session elevation with error", async () => {
    const mockRes = { data: { status: "KO" }, status: 400 };
    vi.mocked(axios).mockResolvedValue(mockRes);

    const result = await verifyUserSessionElevation("otc123");
    expect(result).toBe(false);
});

it("deletes user session elevation successfully", async () => {
    const mockRes = { data: { status: "OK" }, status: 200 };
    vi.mocked(axios).mockResolvedValue(mockRes);

    const result = await deleteUserSessionElevation("delete123");
    expect(axios).toHaveBeenCalledWith({
        method: "DELETE",
        url: "/user/elevation/delete123",
    });
    expect(result).toBe(true);
});

it("deletes user session elevation with error", async () => {
    const mockRes = { data: { status: "KO" }, status: 400 };
    vi.mocked(axios).mockResolvedValue(mockRes);

    const result = await deleteUserSessionElevation("delete123");
    expect(result).toBe(false);
});
