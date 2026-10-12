// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";

import DecisionFormClient from "@views/ConsentPortal/OpenIDConnect/DecisionFormClient";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

it("renders the client description as the name", () => {
    render(<DecisionFormClient client_description={"Test Client"} />);

    expect(screen.getByText("Test Client")).toBeInTheDocument();
});
