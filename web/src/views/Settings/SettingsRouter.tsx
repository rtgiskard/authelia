import {
	IndexRoute,
	SecuritySubRoute,
	SettingsRoute,
	SettingsTwoFactorAuthenticationSubRoute,
	SettingsUserManagementSubRoute,
} from "@constants/Routes";
import { useConfiguration } from "@hooks/Configuration";
import { useRouterNavigate } from "@hooks/RouterNavigate";
import { useAutheliaState } from "@hooks/State";
import SettingsLayout from "@layouts/SettingsLayout";
import { AuthenticationLevel } from "@services/State";
import SecurityView from "@views/Settings/Security/SecurityView";
import SettingsView from "@views/Settings/SettingsView";
import TwoFactorAuthenticationView from "@views/Settings/TwoFactorAuthentication/TwoFactorAuthenticationView";
import UserManagementView from "@views/Settings/UserManagement/UserManagementView";
import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

const SettingsRouter = () => {
	const navigate = useRouterNavigate();
	const location = useLocation();
	const [configuration, fetchConfiguration] = useConfiguration();
	const [state, fetchState, , fetchStateError] = useAutheliaState();

	useEffect(() => {
		fetchConfiguration();
		fetchState();
	}, [fetchConfiguration, fetchState]);

	useEffect(() => {
		if (
			fetchStateError ||
			(state && state.authentication_level < AuthenticationLevel.OneFactor)
		) {
			navigate(IndexRoute);
		}
	}, [state, fetchStateError, navigate]);

	useEffect(() => {
		if (
			configuration?.administration_enabled === false &&
			(location.pathname ===
				`${SettingsRoute}${SettingsUserManagementSubRoute}` ||
				location.pathname ===
					`${SettingsRoute}${SettingsUserManagementSubRoute}/`)
		) {
			navigate(SettingsRoute);
		}
	}, [configuration, location, navigate]);

	return (
		<SettingsLayout
			administrationEnabled={configuration?.administration_enabled}
		>
			<Routes>
				<Route path={IndexRoute} element={<SettingsView />} />
				<Route path={SecuritySubRoute} element={<SecurityView />} />
				<Route
					path={SettingsTwoFactorAuthenticationSubRoute}
					element={<TwoFactorAuthenticationView />}
				/>
				<Route
					path={SettingsUserManagementSubRoute}
					element={<UserManagementView />}
				/>
			</Routes>
		</SettingsLayout>
	);
};

export default SettingsRouter;
