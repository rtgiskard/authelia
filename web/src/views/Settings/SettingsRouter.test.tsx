import { useConfiguration } from "@hooks/Configuration";
import { useAutheliaState } from "@hooks/State";
import { act, render, screen } from "@testing-library/react";
import SettingsRouter from "@views/Settings/SettingsRouter";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

const mockFetchConfiguration = vi.fn();
const mockNavigate = vi.fn();

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@hooks/Configuration", () => ({
	useConfiguration: vi.fn(),
}));

vi.mock("@hooks/State", () => ({
	useAutheliaState: vi.fn(),
}));

vi.mock("@hooks/RouterNavigate", () => ({
	useRouterNavigate: () => mockNavigate,
}));

vi.mock("@constants/Routes", () => ({
	IndexRoute: "/",
	SecuritySubRoute: "/security",
	SettingsRoute: "/settings",
	SettingsTwoFactorAuthenticationSubRoute: "/two-factor-authentication",
	SettingsUserManagementSubRoute: "/user-management",
}));

vi.mock("@layouts/SettingsLayout", () => ({
	default: (props: {
		administrationEnabled?: boolean;
		children?: ReactNode;
	}) => (
		<div
			data-administration-enabled={String(props.administrationEnabled)}
			data-testid="settings-layout"
		>
			{props.children}
		</div>
	),
}));

vi.mock("@views/Settings/SettingsView", () => ({
	default: () => <div data-testid="settings-view" />,
}));

vi.mock("@views/Settings/Security/SecurityView", () => ({
	default: () => <div data-testid="security-view" />,
}));

vi.mock(
	"@views/Settings/TwoFactorAuthentication/TwoFactorAuthenticationView",
	() => ({
		default: () => <div data-testid="2fa-view" />,
	}),
);

vi.mock("@views/Settings/UserManagement/UserManagementView", () => ({
	default: () => <div data-testid="user-management-view" />,
}));

beforeEach(() => {
	mockFetchConfiguration.mockReset();
	mockNavigate.mockReset();
	vi.mocked(useConfiguration).mockReturnValue([
		undefined,
		mockFetchConfiguration,
		false,
		undefined,
	]);
});

afterEach(() => {
	vi.restoreAllMocks();
});

it("renders without crashing", async () => {
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.mocked(useAutheliaState).mockReturnValue([
		{ authentication_level: 1, factor_knowledge: true, username: "test" },
		vi.fn(),
		false,
		undefined,
	]);
	await act(async () => {
		render(
			<MemoryRouter initialEntries={["/settings"]}>
				<SettingsRouter />
			</MemoryRouter>,
		);
	});
});

it("unauthenticated state calls navigate to index route", async () => {
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.mocked(useAutheliaState).mockReturnValue([
		{ authentication_level: 0, factor_knowledge: false, username: "" },
		vi.fn(),
		false,
		undefined,
	]);
	await act(async () => {
		render(
			<MemoryRouter initialEntries={["/settings"]}>
				<SettingsRouter />
			</MemoryRouter>,
		);
	});
	expect(mockNavigate).toHaveBeenCalledWith("/");
});

it("fetchStateError calls navigate to index route", async () => {
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.mocked(useAutheliaState).mockReturnValue([
		undefined,
		vi.fn(),
		false,
		new Error("test"),
	]);
	await act(async () => {
		render(
			<MemoryRouter initialEntries={["/settings"]}>
				<SettingsRouter />
			</MemoryRouter>,
		);
	});
	expect(mockNavigate).toHaveBeenCalledWith("/");
});

it("authenticated state does not call navigate", async () => {
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.mocked(useAutheliaState).mockReturnValue([
		{ authentication_level: 1, factor_knowledge: true, username: "test" },
		vi.fn(),
		false,
		undefined,
	]);
	await act(async () => {
		render(
			<MemoryRouter initialEntries={["/settings"]}>
				<SettingsRouter />
			</MemoryRouter>,
		);
	});
	expect(mockNavigate).not.toHaveBeenCalled();
});

it("passes administration availability to the settings layout", async () => {
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.mocked(useConfiguration).mockReturnValue([
		{
			administration_enabled: true,
			available_methods: new Set(),
			password_change_disabled: false,
			password_reset_disabled: false,
		},
		mockFetchConfiguration,
		false,
		undefined,
	]);
	vi.mocked(useAutheliaState).mockReturnValue([
		{ authentication_level: 1, factor_knowledge: true, username: "test" },
		vi.fn(),
		false,
		undefined,
	]);

	await act(async () => {
		render(
			<MemoryRouter initialEntries={["/settings"]}>
				<SettingsRouter />
			</MemoryRouter>,
		);
	});

	expect(screen.getByTestId("settings-layout")).toHaveAttribute(
		"data-administration-enabled",
		"true",
	);
	expect(mockFetchConfiguration).toHaveBeenCalled();
});

it("navigates away from user management when administration is disabled", async () => {
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.mocked(useConfiguration).mockReturnValue([
		{
			administration_enabled: false,
			available_methods: new Set(),
			password_change_disabled: false,
			password_reset_disabled: false,
		},
		mockFetchConfiguration,
		false,
		undefined,
	]);
	vi.mocked(useAutheliaState).mockReturnValue([
		{ authentication_level: 1, factor_knowledge: true, username: "test" },
		vi.fn(),
		false,
		undefined,
	]);

	await act(async () => {
		render(
			<MemoryRouter initialEntries={["/settings/user-management"]}>
				<SettingsRouter />
			</MemoryRouter>,
		);
	});

	expect(mockNavigate).toHaveBeenCalledWith("/settings");
});

it("does not navigate away from user management with a trailing slash when administration is enabled", async () => {
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.mocked(useConfiguration).mockReturnValue([
		{
			administration_enabled: true,
			available_methods: new Set(),
			password_change_disabled: false,
			password_reset_disabled: false,
		},
		mockFetchConfiguration,
		false,
		undefined,
	]);
	vi.mocked(useAutheliaState).mockReturnValue([
		{ authentication_level: 1, factor_knowledge: true, username: "test" },
		vi.fn(),
		false,
		undefined,
	]);

	await act(async () => {
		render(
			<MemoryRouter initialEntries={["/settings/user-management/"]}>
				<SettingsRouter />
			</MemoryRouter>,
		);
	});

	expect(mockNavigate).not.toHaveBeenCalled();
});
