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
    usernameLabel?: string;
    username?: string;
    emailLabel?: string;
    email?: string;
    validity?: string;
    expires?: string;
    link?: string;
    linkText?: string;
    nextSteps?: string;
    loginLabel?: string;
    loginURL?: string;
    expired?: string;
    ignore?: string;
    privacy?: string;
    fallbackLinkText?: string;
    hidePreview?: boolean;
    isPlainText?: boolean;
}

export const UserOnboarding = (props: Props) => (
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
                <Heading style={{ fontSize: "26px", fontWeight: 600, lineHeight: "34px", margin: "0 0 24px" }}>
                    {props.title}
                </Heading>
                <Text style={{ margin: "0 0 16px", overflowWrap: "anywhere" }}>
                    {props.greeting} {props.displayName},
                </Text>
                <Text style={{ margin: "0 0 20px" }}>{props.body}</Text>
                <Section
                    style={{
                        backgroundColor: "#fafafa",
                        border: "1px solid #e5e5e5",
                        borderRadius: "6px",
                        padding: "12px 16px",
                    }}
                >
                    <Text style={{ fontSize: "13px", lineHeight: "20px", margin: 0, overflowWrap: "anywhere" }}>
                        {props.usernameLabel}: <strong>{props.username}</strong>
                    </Text>
                    <Text style={{ fontSize: "13px", lineHeight: "20px", margin: "4px 0 0", overflowWrap: "anywhere" }}>
                        {props.emailLabel}: {props.email}
                    </Text>
                    <Text style={{ fontSize: "13px", lineHeight: "20px", color: "#525252", margin: "4px 0 0" }}>
                        {props.validity}
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
                <Text style={{ fontSize: "14px", lineHeight: "22px", margin: "0 0 12px" }}>{props.nextSteps}</Text>
                <Text style={{ fontSize: "14px", lineHeight: "22px", margin: "0 0 12px", overflowWrap: "anywhere" }}>
                    {props.loginLabel}:{" "}
                    {props.isPlainText ? (
                        props.loginURL
                    ) : (
                        <Link href={props.loginURL} style={{ color: "#1976d2", textDecoration: "underline" }}>
                            {props.loginURL}
                        </Link>
                    )}
                </Text>
                <Text style={{ fontSize: "14px", lineHeight: "22px", color: "#525252", margin: "0 0 12px" }}>
                    {props.expired}
                </Text>
                <Text style={{ fontSize: "14px", lineHeight: "22px", color: "#525252", margin: "0 0 12px" }}>
                    {props.ignore}
                </Text>
                <Text style={{ fontSize: "14px", lineHeight: "22px", color: "#525252", margin: "0 0 12px" }}>
                    {props.privacy}
                </Text>
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
                            <Link href={props.link} style={{ color: "#525252", textDecoration: "underline" }}>
                                {props.link}
                            </Link>
                        </Text>
                    </Section>
                )}
            </Container>
        </Body>
    </Html>
);

UserOnboarding.PreviewProps = {
    title: "Your account has been created — set your password to get started",
    displayName: "John Doe",
    greeting: "Hello",
    body: "Welcome! An administrator has created an account for you. Please set your password to get started.",
    usernameLabel: "Username",
    username: "john",
    emailLabel: "Email",
    email: "john@example.com",
    validity: "Valid for: 2 hours",
    expires: "Expires at: 2026-10-22 12:30:00 UTC",
    link: "https://auth.example.com/reset-password/step2?token=example",
    linkText: "Set your password",
    nextSteps:
        "After setting your password, open the sign-in page below and sign in with your username and new password.",
    loginLabel: "Sign-in page",
    loginURL: "https://auth.example.com/",
    expired: "If this link has expired, contact your administrator to send a new one.",
    ignore: "If you were not expecting this invitation, you can ignore this email or contact your administrator.",
    privacy: "Do not forward this email or share this link.",
    fallbackLinkText: "If the button does not work, open this link in your browser:",
} as Props;

export default UserOnboarding;
