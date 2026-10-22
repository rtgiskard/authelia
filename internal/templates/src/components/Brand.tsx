// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";

import { Text } from "react-email";

export const Brand = () => {
    return (
        <Text
            style={{
                color: "#1976d2",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "2px",
                lineHeight: "20px",
                margin: "0 0 24px",
            }}
        >
            Authelia
        </Text>
    );
};
