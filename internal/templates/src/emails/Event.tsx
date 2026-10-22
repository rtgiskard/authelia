// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";

import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "react-email";

import { Brand } from "../components/Brand";

export interface Props {
    language?: string;
    title?: string;
    displayName?: string;
    greeting?: string;
    ownAction?: string;
    otherAction?: string;
    detailsLabel?: string;
    remoteIPLabel?: string;
    remoteIP?: string;
    detailsKey?: string;
    detailsValue?: string;
    detailsPrefix?: string;
    detailsSuffix?: string;
    hidePreview?: boolean;
}

export const Event = (props: Props) => (
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
                <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 12px" }}>{props.ownAction}</Text>
                <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 20px" }}>{props.otherAction}</Text>
                <Section style={{ borderTop: "1px solid #e5e5e5", paddingTop: "20px", marginTop: "24px" }}>
                    <Heading
                        as="h2"
                        style={{
                            fontSize: "15px",
                            fontWeight: 600,
                            lineHeight: "22px",
                            color: "#525252",
                            margin: "0 0 12px",
                        }}
                    >
                        {props.detailsLabel}
                    </Heading>
                    {props.detailsPrefix}
                    <Text
                        style={{
                            fontSize: "13px",
                            lineHeight: "20px",
                            color: "#525252",
                            margin: "0 0 8px",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                        }}
                    >
                        <strong>{props.detailsKey}:</strong> {props.detailsValue}
                    </Text>
                    {props.detailsSuffix}
                    <Text
                        style={{
                            fontSize: "13px",
                            lineHeight: "20px",
                            color: "#737373",
                            margin: "12px 0 0",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                        }}
                    >
                        {props.remoteIPLabel}: {props.remoteIP}
                    </Text>
                </Section>
            </Container>
        </Body>
    </Html>
);

Event.PreviewProps = {
    title: "Password changed successfully",
    displayName: "John Doe",
    greeting: "Hello",
    ownAction: "If this was you, no action is needed.",
    otherAction:
        "If this was not you, reset your password from your usual sign-in page and contact your administrator.",
    detailsLabel: "Event details",
    detailsKey: "Action",
    detailsValue: "Password Change",
    remoteIPLabel: "Request IP",
    remoteIP: "127.0.0.1",
} as Props;

export default Event;
