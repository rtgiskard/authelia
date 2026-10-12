// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { AppWindow } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface Props {
    client_description: string;
}

function DecisionFormClient({ client_description }: Props) {
    const { t: translate } = useTranslation(["consent"]);

    return (
        <div className="flex w-full items-center gap-3 text-left">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <AppWindow className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
                <span
                    id={"openid-consent-client-name"}
                    data-testid={"openid-consent-client-name"}
                    className="block truncate font-semibold"
                >
                    {client_description || translate("Consent Request")}
                </span>
            </span>
        </div>
    );
}

export default DecisionFormClient;
