import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import ChangePasswordDialog from "@views/Settings/Security/ChangePasswordDialog";

const mocks = vi.hoisted(() => ({
    getPasswordPolicyConfiguration: vi.fn(),
    postPasswordChange: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@contexts/NotificationsContext", () => ({
    useNotifications: () => ({
        createErrorNotification: vi.fn(),
        createSuccessNotification: vi.fn(),
    }),
}));

vi.mock("@hooks/CapsLock", () => ({
    default: () => vi.fn(),
}));

vi.mock("@components/PasswordMeter", () => ({
    default: () => <div data-testid="password-meter" />,
}));

vi.mock("@services/ChangePassword", () => ({
    postPasswordChange: mocks.postPasswordChange,
}));

vi.mock("@services/PasswordPolicyConfiguration", () => ({
    getPasswordPolicyConfiguration: mocks.getPasswordPolicyConfiguration,
}));

const oldPasswordLabel = /^Old Password/;
const newPasswordLabel = /^New Password/;
const repeatNewPasswordLabel = /^Repeat New Password/;

beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getPasswordPolicyConfiguration.mockReset();
    mocks.getPasswordPolicyConfiguration.mockResolvedValue({
        max_length: 0,
        min_length: 8,
        min_score: 0,
        mode: "disabled",
        require_lowercase: false,
        require_number: false,
        require_special: false,
        require_uppercase: false,
    });
    mocks.postPasswordChange.mockReset();
    mocks.postPasswordChange.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

it("renders preparing state without password fields", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ChangePasswordDialog username="john" open={true} flow="preparing" setFlow={vi.fn()} setClosed={vi.fn()} />);
    expect(screen.getByText("Change Password")).toBeInTheDocument();
    expect(screen.getByText("Preparing password change")).toBeInTheDocument();
    expect(screen.getByText("Checking whether additional identity verification is required")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.queryByLabelText(oldPasswordLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change Password" })).not.toBeInTheDocument();
});

it("renders verifying state without password fields", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ChangePasswordDialog username="john" open={true} flow="verifying" setFlow={vi.fn()} setClosed={vi.fn()} />);
    expect(screen.getByText("Verifying your identity")).toBeInTheDocument();
    expect(screen.getByText("Complete identity verification to unlock the password fields")).toBeInTheDocument();
    expect(screen.queryByLabelText(oldPasswordLabel)).not.toBeInTheDocument();
});

it("renders password fields only when ready", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ChangePasswordDialog username="john" open={true} flow="ready" setFlow={vi.fn()} setClosed={vi.fn()} />);
    expect(await screen.findByLabelText(oldPasswordLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(newPasswordLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(repeatNewPasswordLabel)).toBeInTheDocument();
    await waitFor(() => {
        expect(screen.getByRole("button", { name: "Change Password" })).toBeDisabled();
    });
});

it("does not render content when closed", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ChangePasswordDialog username="john" open={false} flow="ready" setFlow={vi.fn()} setClosed={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Change Password" })).not.toBeInTheDocument();
});

it("keeps password fields usable when password policy loading fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getPasswordPolicyConfiguration.mockRejectedValue(new Error("policy failed"));

    render(<ChangePasswordDialog username="john" open={true} flow="ready" setFlow={vi.fn()} setClosed={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText(oldPasswordLabel), { target: { value: "old-password" } });
    fireEvent.change(screen.getByLabelText(newPasswordLabel), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText(repeatNewPasswordLabel), { target: { value: "new-password" } });

    await waitFor(() => {
        expect(screen.getByRole("button", { name: "Change Password" })).toBeEnabled();
    });
});

it("renders success state visibly before close", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ChangePasswordDialog username="john" open={true} flow="success" setFlow={vi.fn()} setClosed={vi.fn()} />);
    expect(screen.getByText("Password changed successfully")).toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change Password" })).not.toBeInTheDocument();
});

it("shows success before closing after a successful password change", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const setClosed = vi.fn();
    const setFlow = vi.fn();
    let resolvePasswordChange: (value?: PromiseLike<void> | void) => void = () => {};
    const passwordChange = new Promise<void>((resolve) => {
        resolvePasswordChange = resolve;
    });
    mocks.postPasswordChange.mockReturnValueOnce(passwordChange);

    render(<ChangePasswordDialog username="john" open={true} flow="ready" setFlow={setFlow} setClosed={setClosed} />);

    fireEvent.change(await screen.findByLabelText(oldPasswordLabel), { target: { value: "old-password" } });
    fireEvent.change(screen.getByLabelText(newPasswordLabel), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText(repeatNewPasswordLabel), { target: { value: "new-password" } });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));

    expect(mocks.postPasswordChange).toHaveBeenCalledWith("john", "old-password", "new-password");

    await act(async () => {
        resolvePasswordChange();
        await passwordChange;
    });

    expect(setFlow).toHaveBeenCalledWith("success");
    expect(setClosed).not.toHaveBeenCalled();

    act(() => {
        vi.advanceTimersByTime(1200);
    });

    expect(setClosed).toHaveBeenCalled();
});
