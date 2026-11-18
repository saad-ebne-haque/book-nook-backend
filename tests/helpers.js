import http from "node:http";
import { calculateJwkThumbprint, exportJWK, generateKeyPair, SignJWT } from "jose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let jwksServer;
let replSet;
let appServer;
let appClient;
let appDb;
let issuer;
let signingKey;
let keyId;
let baseUrl;

/**
 * Boots an isolated backend for the tests:
 * - a local MongoDB replica set, so transactions work and the real database stays untouched
 * - a fake Better Auth JWKS endpoint, so the API's JWT verification succeeds
 * - the Express app listening on an ephemeral port
 */
export async function startTestEnvironment() {
    const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
    signingKey = privateKey;

    const publicJwk = await exportJWK(publicKey);
    keyId = await calculateJwkThumbprint(publicJwk);
    const jwks = { keys: [{ ...publicJwk, kid: keyId, alg: "RS256", use: "sig" }] };

    jwksServer = http.createServer((request, response) => {
        if (request.url === "/api/auth/jwks") {
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify(jwks));
            return;
        }
        response.writeHead(404);
        response.end();
    });
    await new Promise((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
    issuer = `http://127.0.0.1:${jwksServer.address().port}`;

    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

    process.env.BETTER_AUTH_URL = issuer;
    process.env.MONGODB_SECRET_URI = replSet.getUri();
    process.env.VERCEL = "1";

    const backend = await import("../index.js");
    appClient = backend.client;
    appDb = backend.db;

    await new Promise((resolve) => {
        appServer = backend.default.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${appServer.address().port}`;

    return baseUrl;
}

export async function stopTestEnvironment() {
    if (appServer) {
        appServer.closeAllConnections();
        await new Promise((resolve) => appServer.close(resolve));
    }
    if (jwksServer) {
        jwksServer.closeAllConnections();
        await new Promise((resolve) => jwksServer.close(resolve));
    }
    if (appClient) {
        await appClient.close();
    }
    if (replSet) {
        await replSet.stop();
    }
}

/** Signs a Better Auth shaped JWT. Omit email to test the missing-claim path. */
export async function createToken({ sub = "test-user", email, name } = {}) {
    const claims = {};
    if (email !== undefined) {
        claims.email = email;
    }
    if (name !== undefined) {
        claims.name = name;
    }

    return new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: keyId })
        .setSubject(sub)
        .setIssuer(issuer)
        .setAudience(issuer)
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(signingKey);
}

export async function api(path, { method = "GET", token, body } = {}) {
    const headers = {};
    if (token) {
        headers.authorization = `Bearer ${token}`;
    }
    if (body !== undefined) {
        headers["content-type"] = "application/json";
    }

    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await response.json().catch(() => null);
    return { status: response.status, payload };
}

export async function resetDatabase() {
    await Promise.all([
        appDb.collection("books").deleteMany({}),
        appDb.collection("borrows").deleteMany({}),
    ]);
}

export function futureReturnDate(daysAhead = 7) {
    return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
}

export async function createBook(token, overrides = {}) {
    const book = {
        title: "The Silent Library",
        author: "Amina Rahman",
        category: "Fiction",
        description: "A quiet story about a library that remembers every reader.",
        image: "https://example.com/covers/silent-library.jpg",
        language: "English",
        publishedYear: 2021,
        totalCopies: 3,
        availableCopies: 3,
        ...overrides,
    };

    const { status, payload } = await api("/books", { method: "POST", token, body: book });
    if (status !== 201) {
        throw new Error(`Book creation failed with ${status}: ${JSON.stringify(payload)}`);
    }

    return { book, bookId: payload.data.insertedId };
}

export async function borrowBook(token, bookId, returnDate = futureReturnDate()) {
    return api("/borrows", { method: "POST", token, body: { bookId, returnDate } });
}
