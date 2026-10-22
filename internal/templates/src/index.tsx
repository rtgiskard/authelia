// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import { render } from "react-email";
import * as React from "react";
import * as fs from "node:fs";

import Event from "./emails/Event";
import IdentityVerificationJWT from "./emails/IdentityVerificationJWT";
import IdentityVerificationOTC from "./emails/IdentityVerificationOTC";
import UserOnboarding from "./emails/UserOnboarding";

const optsHTML = { pretty: false, plainText: false } as const;
const optsTXT = {
    pretty: false,
    plainText: true as const,
    // Heading uppercasing would corrupt case-sensitive Go template actions.
    htmlToTextOptions: {
        selectors: [
            { selector: "h1", options: { uppercase: false } },
            { selector: "h2", options: { uppercase: false } },
        ],
    },
};

const translated = (text: string) => `{{ notificationText .Language ${JSON.stringify(text)} }}`;
const expires = `{{ if not .ExpiresAt.IsZero }}${translated("Expires at")}: {{ .ExpiresAt.UTC.Format "2006-01-02 15:04:05 UTC" }}{{ end }}`;
const common = {
    language: "{{ notificationLanguage .Language }}",
    title: "{{ .Title }}",
    displayName: "{{ .DisplayName }}",
    greeting: translated("Hello"),
};

// React escapes quotes in text and attributes, including the Go template source.
// Decode only template actions; normal email content must retain HTML escaping.
async function renderTemplate(element: React.ReactElement, options: typeof optsHTML | typeof optsTXT) {
    const output = await render(element, options);
    return output.replace(/\{\{[\s\S]*?\}\}/g, (action) =>
        action
            .replaceAll("&quot;", '"')
            .replaceAll("&#x27;", "'")
            .replaceAll("&lt;", "<")
            .replaceAll("&gt;", ">")
            .replaceAll("&amp;", "&"),
    );
}

async function doRender() {
    const propsEvent = {
        ...common,
        ownAction: `{{ if .Administrator }}${translated("An administrator made this change to your account.")}{{ else }}${translated("If this was you, no action is needed.")}{{ end }}`,
        otherAction: `{{ if .Administrator }}${translated("If you were expecting this change, no action is needed. Otherwise, contact your administrator.")}{{ else }}${translated("If this was not you, reset your password from your usual sign-in page and contact your administrator.")}{{ end }}`,
        detailsLabel: translated("Event details"),
        remoteIPLabel: translated("Request IP"),
        remoteIP: "{{ .RemoteIP }}",
        detailsKey: "{{ $key }}",
        detailsValue: "{{ index $.Details $key }}",
        detailsPrefix: "{{ range $key := sortAlpha (keys .Details) }}",
        detailsSuffix: "{{ end }}",
    };

    fs.writeFileSync("../embed/notification/Event.html", await renderTemplate(<Event {...propsEvent} />, optsHTML));
    fs.writeFileSync("../embed/notification/Event.txt", await renderTemplate(<Event {...propsEvent} />, optsTXT));
    fs.writeFileSync(
        "../../../examples/templates/notifications/no-preview/Event.html",
        await renderTemplate(<Event {...propsEvent} hidePreview />, optsHTML),
    );

    const propsJWT = {
        ...common,
        body: `{{ if .Administrator }}${translated("An administrator has requested a password reset for your account.")}{{ else }}${translated("Use this link to reset your password.")}{{ end }}`,
        accountLabel: translated("Account"),
        domain: "{{ .Domain }}",
        expires,
        ignore: `{{ if .Administrator }}${translated("If you were not expecting this reset, you can ignore this email or contact your administrator. Your password has not changed.")}{{ else }}${translated("If you did not request this, you can ignore this email. Your password has not changed.")}{{ end }}`,
        privacy: translated("Do not forward this email or share this link."),
        link: "{{ .LinkURL }}",
        linkText: "{{ .LinkText }}",
        fallbackLinkText: translated("If the button does not work, open this link in your browser:"),
        revocationLinkURL: "{{ .RevocationLinkURL }}",
        revocationLinkText: translated("Cancel this link"),
        revocationPrefix: "{{ if .RevocationLinkURL }}",
        revocationSuffix: "{{ end }}",
    };

    fs.writeFileSync(
        "../embed/notification/IdentityVerificationJWT.html",
        await renderTemplate(<IdentityVerificationJWT {...propsJWT} />, optsHTML),
    );
    fs.writeFileSync(
        "../embed/notification/IdentityVerificationJWT.txt",
        await renderTemplate(<IdentityVerificationJWT {...propsJWT} isPlainText />, optsTXT),
    );
    fs.writeFileSync(
        "../../../examples/templates/notifications/no-preview/IdentityVerificationJWT.html",
        await renderTemplate(<IdentityVerificationJWT {...propsJWT} hidePreview />, optsHTML),
    );

    const propsOnboarding = {
        ...common,
        body: translated(
            "Welcome! An administrator has created an account for you. Please set your password to get started.",
        ),
        usernameLabel: translated("Username"),
        username: "{{ .Username }}",
        emailLabel: translated("Email"),
        email: "{{ .Email }}",
        validity: `${translated("Valid for")}: {{ .Validity }}`,
        expires,
        link: "{{ .LinkURL }}",
        linkText: "{{ .LinkText }}",
        nextSteps: translated(
            "After setting your password, open the sign-in page below and sign in with your username and new password.",
        ),
        loginLabel: translated("Sign-in page"),
        loginURL: "{{ .LoginURL }}",
        expired: translated("If this link has expired, contact your administrator to send a new one."),
        ignore: translated(
            "If you were not expecting this invitation, you can ignore this email or contact your administrator.",
        ),
        privacy: translated("Do not forward this email or share this link."),
        fallbackLinkText: translated("If the button does not work, open this link in your browser:"),
    };

    fs.writeFileSync(
        "../embed/notification/UserOnboarding.html",
        await renderTemplate(<UserOnboarding {...propsOnboarding} />, optsHTML),
    );
    fs.writeFileSync(
        "../embed/notification/UserOnboarding.txt",
        await renderTemplate(<UserOnboarding {...propsOnboarding} isPlainText />, optsTXT),
    );
    fs.writeFileSync(
        "../../../examples/templates/notifications/no-preview/UserOnboarding.html",
        await renderTemplate(<UserOnboarding {...propsOnboarding} hidePreview />, optsHTML),
    );

    const propsOTC = {
        ...common,
        body: translated("Enter this code in the page where you requested it."),
        expires,
        privacy: translated("Do not share this code."),
        otherAction: translated("If you did not request this code, cancel it and contact your administrator."),
        oneTimeCode: "{{ .OneTimeCode }}",
        revocationLinkURL: "{{ .RevocationLinkURL }}",
        revocationLinkText: translated("Cancel this code"),
        revocationPrefix: "{{ if .RevocationLinkURL }}",
        revocationSuffix: "{{ end }}",
    };

    fs.writeFileSync(
        "../embed/notification/IdentityVerificationOTC.html",
        await renderTemplate(<IdentityVerificationOTC {...propsOTC} />, optsHTML),
    );
    fs.writeFileSync(
        "../embed/notification/IdentityVerificationOTC.txt",
        await renderTemplate(<IdentityVerificationOTC {...propsOTC} isPlainText />, optsTXT),
    );
    fs.writeFileSync(
        "../../../examples/templates/notifications/no-preview/IdentityVerificationOTC.html",
        await renderTemplate(<IdentityVerificationOTC {...propsOTC} hidePreview />, optsHTML),
    );
}

doRender().then();
