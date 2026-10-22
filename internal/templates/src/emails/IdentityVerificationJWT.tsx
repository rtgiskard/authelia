// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";

import { Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text } from "react-email";

import { Brand } from "../components/Brand";

interface Props {
    language?: string;
    title?: string;
    displayName?: string;
    greeting?: string;
    body?: string;
    accountLabel?: string;
    domain?: string;
    expires?: string;
    ignore?: string;
    privacy?: string;
    link?: string;
    linkText?: string;
    fallbackLinkText?: string;
    revocationLinkURL?: string;
    revocationLinkText?: string;
    revocationPrefix?: string;
    revocationSuffix?: string;
    hidePreview?: boolean;
    isPlainText?: boolean;
}

export const IdentityVerificationJWT = (props: Props) => (
    <Html lang={props.language || "en"} dir="ltr">
        <Head />
        {props.hidePreview ? null : <Preview>{props.title ?? ""}</Preview>}
        <Body
            style={{
                fontFamily: "Arial, Helvetica, sans-serif",
                fontSize: "15px",
                lineHeight: "24px",
                color: "#222222",
                backgroundColor: "#f5f5f5",
                margin: 0,
                padding: "16px 12px",
            }}
        >
            <Container
                style={{
                    width: "100%",
                    maxWidth: "560px",
                    boxSizing: "border-box",
                    margin: "16px auto",
                    padding: "28px 24px",
                    backgroundColor: "#ffffff",
                    border: "1px solid #e5e5e5",
                    borderRadius: "8px",
                }}
            >
                <Brand />
                <Heading
                    style={{
                        fontSize: "26px",
                        fontWeight: 600,
                        lineHeight: "34px",
                        letterSpacing: "-0.5px",
                        margin: "0 0 24px",
                    }}
                >
                    {props.title}
                </Heading>
                <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 16px", overflowWrap: "anywhere" }}>
                    {props.greeting} {props.displayName},
                </Text>
                <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 20px" }}>{props.body}</Text>
                <Section
                    style={{
                        backgroundColor: "#fafafa",
                        border: "1px solid #e5e5e5",
                        borderRadius: "6px",
                        padding: "12px 16px",
                    }}
                >
                    <Text
                        style={{
                            fontSize: "13px",
                            lineHeight: "20px",
                            color: "#525252",
                            margin: 0,
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                        }}
                    >
                        {props.accountLabel}: <strong style={{ color: "#222222" }}>{props.domain}</strong>
                    </Text>
                    <Text style={{ fontSize: "13px", lineHeight: "20px", color: "#525252", margin: "4px 0 0" }}>
                        {props.expires}
                    </Text>
                </Section>
                {props.isPlainText ? (
                    <Text>
                        {props.linkText}: {props.link}
                    </Text>
                ) : (
                    <Section style={{ margin: "24px 0" }}>
                        <Button
                            href={props.link}
                            style={{
                                backgroundColor: "#1976d2",
                                color: "#ffffff",
                                fontSize: "15px",
                                fontWeight: 600,
                                lineHeight: "20px",
                                padding: "14px 22px",
                                borderRadius: "6px",
                                textDecoration: "none",
                                textAlign: "center",
                                boxSizing: "border-box",
                                maxWidth: "100%",
                            }}
                        >
                            {props.linkText}
                        </Button>
                    </Section>
                )}
                <Text style={{ fontSize: "14px", lineHeight: "22px", color: "#525252", margin: "0 0 12px" }}>
                    {props.ignore}
                </Text>
                <Text style={{ fontSize: "14px", lineHeight: "22px", color: "#525252", margin: "0 0 12px" }}>
                    {props.privacy}
                </Text>
                {props.revocationPrefix}
                {props.isPlainText ? (
                    <Text>
                        {props.revocationLinkText}: {props.revocationLinkURL}
                    </Text>
                ) : (
                    <Text style={{ fontSize: "14px", lineHeight: "22px", margin: "0 0 12px" }}>
                        <Link href={props.revocationLinkURL} style={{ color: "#525252", textDecoration: "underline" }}>
                            {props.revocationLinkText}
                        </Link>
                    </Text>
                )}
                {props.revocationSuffix}
                {props.isPlainText ? null : (
                    <Section style={{ borderTop: "1px solid #e5e5e5", paddingTop: "16px", marginTop: "20px" }}>
                        <Text style={{ fontSize: "12px", lineHeight: "20px", color: "#737373", margin: "0 0 4px" }}>
                            {props.fallbackLinkText}
                        </Text>
                        <Text
                            style={{
                                fontSize: "12px",
                                lineHeight: "20px",
                                margin: 0,
                                overflowWrap: "anywhere",
                                wordBreak: "break-word",
                            }}
                        >
                            <Link
                                href={props.link}
                                style={{
                                    color: "#525252",
                                    textDecoration: "underline",
                                    overflowWrap: "anywhere",
                                    wordBreak: "break-word",
                                }}
                            >
                                {props.link}
                            </Link>
                        </Text>
                    </Section>
                )}
            </Container>
        </Body>
    </Html>
);

IdentityVerificationJWT.PreviewProps = {
    title: "Reset your password",
    displayName: "John Doe",
    greeting: "Hello",
    body: "Use this link to reset your password.",
    accountLabel: "Account",
    domain: "example.com",
    expires: "Expires at: 2026-10-22 12:30:00 UTC",
    ignore: "If you did not request this, you can ignore this email. Your password has not changed.",
    privacy: "Do not forward this email or share this link.",
    link: "https://auth.example.com/reset-password/step2?token=example",
    linkText: "Reset your password",
    fallbackLinkText: "If the button does not work, open this link in your browser:",
    revocationLinkURL: "https://auth.example.com/revoke/reset-password?token=example",
    revocationLinkText: "Cancel this link",
} as Props;

export default IdentityVerificationJWT;
