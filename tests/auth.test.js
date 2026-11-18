import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import {
    api,
    createBook,
    createToken,
    resetDatabase,
    startTestEnvironment,
    stopTestEnvironment,
} from "./helpers.js";

describe("authentication", () => {
    before(async () => {
        await startTestEnvironment();
    });

    after(async () => {
        await stopTestEnvironment();
    });

    beforeEach(async () => {
        await resetDatabase();
    });

    it("keeps GET /books public", async () => {
        const { status, payload } = await api("/books");
        assert.equal(status, 200);
        assert.equal(payload.success, true);
        assert.ok(Array.isArray(payload.data));
    });

    it("rejects every protected route without a token", async () => {
        const routes = [
            { method: "GET", path: "/books/653f1f1f1f1f1f1f1f1f1f1f" },
            { method: "POST", path: "/books" },
            { method: "PATCH", path: "/books/653f1f1f1f1f1f1f1f1f1f1f" },
            { method: "DELETE", path: "/books/653f1f1f1f1f1f1f1f1f1f1f" },
            { method: "POST", path: "/borrows" },
            { method: "GET", path: "/borrows" },
            { method: "DELETE", path: "/borrows/653f1f1f1f1f1f1f1f1f1f1f" },
            { method: "GET", path: "/my-books/someone@example.com" },
        ];

        for (const route of routes) {
            const { status, payload } = await api(route.path, { method: route.method });
            assert.equal(status, 401, `${route.method} ${route.path} should require a token`);
            assert.equal(payload.success, false);
            assert.equal(payload.data, null);
        }
    });

    it("rejects a malformed token", async () => {
        const { status, payload } = await api("/borrows", { token: "not-a-jwt-at-all" });
        assert.equal(status, 401);
        assert.equal(payload.success, false);
    });

    it("rejects a token signed with the wrong key", async () => {
        const { privateKey } = await generateKeyPair("RS256", { extractable: true });
        const forged = await new SignJWT({ email: "intruder@example.com" })
            .setProtectedHeader({ alg: "RS256", kid: "any-kid" })
            .setSubject("intruder")
            .setIssuer("http://127.0.0.1:1")
            .setAudience("http://127.0.0.1:1")
            .setIssuedAt()
            .setExpirationTime("10m")
            .sign(privateKey);

        const { status } = await api("/borrows", { token: forged });
        assert.equal(status, 401);
    });

    it("rejects a valid signature that is missing the email claim", async () => {
        const token = await createToken({ sub: "user-without-email" });
        const { status, payload } = await api("/borrows", { token });
        assert.equal(status, 401);
        assert.equal(payload.success, false);
    });

    it("accepts a signed token that carries email and name", async () => {
        const token = await createToken({ email: "reader@example.com", name: "Reader" });
        const { status, payload } = await api("/borrows", { token });
        assert.equal(status, 200);
        assert.deepEqual(payload.data, []);
    });

    it("lets a signed user create a book and read it back", async () => {
        const token = await createToken({ email: "owner@example.com", name: "Owner" });
        const { bookId } = await createBook(token);

        const { status, payload } = await api(`/books/${bookId}`, { token });
        assert.equal(status, 200);
        assert.equal(payload.data.title, "The Silent Library");
        assert.equal(payload.data.addedBy, "owner@example.com");
        assert.equal(payload.data.addedByName, "Owner");
    });

    it("takes the owner from the token, not from the request body", async () => {
        const token = await createToken({ email: "owner@example.com", name: "Owner" });
        const { status, payload } = await api("/books", {
            method: "POST",
            token,
            body: {
                title: "Hijacked Title",
                author: "Someone",
                category: "Others",
                description: "Should not matter.",
                image: "https://example.com/covers/hijacked.jpg",
                language: "English",
                publishedYear: 2020,
                totalCopies: 1,
                availableCopies: 1,
                addedBy: "attacker@example.com",
                addedByName: "Attacker",
            },
        });
        assert.equal(status, 201);

        const { payload: saved } = await api(`/books/${payload.data.insertedId}`, { token });
        assert.equal(saved.data.addedBy, "owner@example.com");
        assert.equal(saved.data.addedByName, "Owner");
    });
});
