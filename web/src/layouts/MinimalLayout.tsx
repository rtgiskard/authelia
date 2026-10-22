// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { ReactNode, useEffect } from "react";

import { useTranslation } from "react-i18next";

import UserSvg from "@assets/images/user.svg?react";
import AppBarLoginPortal from "@components/AppBarLoginPortal";
import PrivacyPolicyDrawer from "@components/PrivacyPolicyDrawer";
import TypographyWithTooltip from "@components/TypographyWithTooltip";
import { EncodedName } from "@constants/constants";
import { UserInfo } from "@models/UserInfo";
import { getLogoOverride } from "@utils/Configuration";

export interface Props {
    id?: string;
    children?: ReactNode;
    title?: null | string;
    userInfo?: UserInfo;
    variant?: "card" | "default";
}

const MinimalLayout = function (props: Props) {
    const { t: translate } = useTranslation();

    const logo = getLogoOverride() ? (
        <img
            src="./static/media/logo.png"
            alt="Logo"
            className="mx-auto my-2 w-16"
            style={{ fill: "var(--custom-icon)" }}
        />
    ) : (
        <UserSvg className="mx-auto my-2 w-16" style={{ fill: "var(--custom-icon)" }} />
    );

    useEffect(() => {
        document.title = translate("Login - {{authelia}}", { authelia: atob(String.fromCodePoint(...EncodedName)) });
    }, [translate]);

    if (props.variant === "card") {
        return (
            <div className="min-h-svh bg-muted/30">
                <AppBarLoginPortal userInfo={props.userInfo} />
                <main
                    id={props.id}
                    className="mx-auto flex min-h-[85svh] w-full max-w-[480px] flex-col justify-center px-4 py-10 sm:pb-24"
                >
                    <div className="mb-6 flex justify-center [&_svg]:h-10 [&_svg]:w-10 [&_img]:w-10">{logo}</div>
                    <section className="rounded-xl border bg-card px-6 py-7 text-card-foreground shadow-sm sm:px-8 sm:py-8">
                        {props.title ? (
                            <h1 className="mb-3 text-2xl font-semibold tracking-tight">{props.title}</h1>
                        ) : null}
                        {props.children}
                    </section>
                </main>
                <PrivacyPolicyDrawer />
            </div>
        );
    }

    return (
        <div>
            <AppBarLoginPortal userInfo={props.userInfo} />
            <div id={props.id} className="flex min-h-[90vh] items-center justify-center text-center">
                <div className="mx-auto w-full max-w-[444px] px-8">
                    <div className="flex flex-col items-stretch">
                        <div className="w-full p-2">{logo}</div>
                        {props.title ? (
                            <div className="w-full">
                                <TypographyWithTooltip variant="h5" value={props.title} />
                            </div>
                        ) : null}
                        <div className="mt-2 py-2">{props.children}</div>
                    </div>
                </div>
                <PrivacyPolicyDrawer />
            </div>
        </div>
    );
};

export default MinimalLayout;
