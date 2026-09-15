import {createHmac} from "node:crypto";

const TOKEN_LIFETIME_SECS = 300;

function base64UrlEncode(input: Buffer | string): string {
    return Buffer.from(input).toString("base64url");
}

export function buildLogonToken(secret: string, identifier: string): string {
    const header = base64UrlEncode(JSON.stringify({alg: "HS256", typ: "JWT"}));
    const payload = base64UrlEncode(JSON.stringify({
        sub: identifier,
        exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECS,
    }));

    const signingInput = `${header}.${payload}`;
    const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");

    return `${signingInput}.${signature}`;
}
