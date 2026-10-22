// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";

import { Body, Container, Head, Heading, Html, Link, Preview, Section, Text } from "react-email";

import { Brand } from "../components/Brand";

interface Props {
    language?: string;
    title?: string;
    displayName?: string;
    greeting?: string;
    body?: string;
    expires?: string;
    privacy?: string;
    otherAction?: string;
    oneTimeCode?: string;
    revocationLinkURL?: string;
    revocationLinkText?: string;
    revocationPrefix?: string;
    revocationSuffix?: string;
    hidePreview?: boolean;
    isPlainText?: boolean;
}

export const IdentityVerificationOTC = (props: Props) => (
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
                        backgroundColor: "#f5f8fc",
                        border: "1px solid #dbe7f5",
                        borderRadius: "6px",
                        padding: "20px 12px",
                        marginBottom: "24px",
                        textAlign: "center",
                    }}
                >
                    <Text
                        id="one-time-code"
                        style={{
                            fontFamily: "'Courier New', monospace",
                            color: "#222222",
                            fontSize: "32px",
                            lineHeight: "40px",
                            fontWeight: 700,
                            letterSpacing: "4px",
                            margin: 0,
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                        }}
                    >
                        {props.oneTimeCode}
                    </Text>
                    <Text style={{ fontSize: "13px", lineHeight: "20px", color: "#525252", margin: "8px 0 0" }}>
                        {props.expires}
                    </Text>
                </Section>
                <Text style={{ fontSize: "14px", lineHeight: "22px", color: "#525252", margin: "0 0 12px" }}>
                    {props.privacy}
                </Text>
                <Text style={{ fontSize: "14px", lineHeight: "22px", color: "#525252", margin: "0 0 12px" }}>
                    {props.otherAction}
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
            </Container>
        </Body>
    </Html>
);

IdentityVerificationOTC.PreviewProps = {
    title: "Confirm your identity",
    displayName: "John Doe",
    greeting: "Hello",
    body: "Enter this code in the page where you requested it.",
    expires: "Expires at: 2026-10-22 12:05:00 UTC",
    privacy: "Do not share this code.",
    otherAction: "If you did not request this code, cancel it and contact your administrator.",
    oneTimeCode: "ABC123",
    revocationLinkURL: "https://auth.example.com/revoke/one-time-code?id=example",
    revocationLinkText: "Cancel this code",
} as Props;

export default IdentityVerificationOTC;
