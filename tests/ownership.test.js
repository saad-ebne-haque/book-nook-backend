import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    api,
    borrowBook,
    createBook,
    createToken,
    resetDatabase,
    startTestEnvironment,
    stopTestEnvironment,
} from "./helpers.js";

describe("ownership checks", () => {
    let ownerToken;
    let strangerToken;

    before(async () => {
        await startTestEnvironment();
        ownerToken = await createToken({ email: "owner@example.com", name: "Owner" });
        strangerToken = await createToken({ email: "stranger@example.com", name: "Stranger" });
    });

    after(async () => {
        await stopTestEnvironment();
    });

    beforeEach(async () => {
        await resetDatabase();
    });

    it("lets the owner update their book", async () => {
        const { bookId } = await createBook(ownerToken);

        const { status } = await api(`/books/${bookId}`, {
            method: "PATCH",
            token: ownerToken,
            body: { title: "Updated Title" },
        });
        assert.equal(status, 200);

        const { payload } = await api(`/books/${bookId}`, { token: ownerToken });
        assert.equal(payload.data.title, "Updated Title");
    });

    it("updates editable details and keeps available copies consistent with active borrows", async () => {
        const { bookId } = await createBook(ownerToken);
        await borrowBook(ownerToken, bookId);

        const { status } = await api(`/books/${bookId}`, {
            method: "PATCH",
            token: ownerToken,
            body: {
                category: "Science",
                publishedYear: 2022,
                totalCopies: 4,
            },
        });
        assert.equal(status, 200);

        const { payload } = await api(`/books/${bookId}`, { token: ownerToken });
        assert.equal(payload.data.category, "Science");
        assert.equal(payload.data.publishedYear, 2022);
        assert.equal(typeof payload.data.publishedYear, "number");
        assert.equal(payload.data.totalCopies, 4);
        assert.equal(typeof payload.data.totalCopies, "number");
        assert.equal(payload.data.availableCopies, 3);
    });

    it("rejects reducing total copies below the number currently borrowed", async () => {
        const { bookId } = await createBook(ownerToken);
        await borrowBook(ownerToken, bookId);
        await borrowBook(strangerToken, bookId);

        const { status, payload } = await api(`/books/${bookId}`, {
            method: "PATCH",
            token: ownerToken,
            body: { totalCopies: 1 },
        });
        assert.equal(status, 409);
        assert.equal(payload.success, false);

        const { payload: unchanged } = await api(`/books/${bookId}`, { token: ownerToken });
        assert.equal(unchanged.data.totalCopies, 3);
        assert.equal(unchanged.data.availableCopies, 1);
    });

    it("rejects invalid category and non-numeric inventory updates", async () => {
        const { bookId } = await createBook(ownerToken);

        for (const body of [
            { category: "Mystery" },
            { totalCopies: "5" },
            { publishedYear: "2020" },
        ]) {
            const { status } = await api(`/books/${bookId}`, {
                method: "PATCH",
                token: ownerToken,
                body,
            });
            assert.equal(status, 400);
        }
    });

    it("blocks another user from updating the book and leaves it unchanged", async () => {
        const { bookId } = await createBook(ownerToken);

        const { status, payload } = await api(`/books/${bookId}`, {
            method: "PATCH",
            token: strangerToken,
            body: { title: "Hacked Title" },
        });
        assert.equal(status, 404);
        assert.equal(payload.success, false);

        const { payload: unchanged } = await api(`/books/${bookId}`, { token: ownerToken });
        assert.equal(unchanged.data.title, "The Silent Library");
    });

    it("lets the owner delete their book", async () => {
        const { bookId } = await createBook(ownerToken);

        const { status } = await api(`/books/${bookId}`, {
            method: "DELETE",
            token: ownerToken,
        });
        assert.equal(status, 200);

        const { status: afterDelete } = await api(`/books/${bookId}`, { token: ownerToken });
        assert.equal(afterDelete, 404);
    });

    it("blocks another user from deleting the book", async () => {
        const { bookId } = await createBook(ownerToken);

        const { status } = await api(`/books/${bookId}`, {
            method: "DELETE",
            token: strangerToken,
        });
        assert.equal(status, 404);

        const { status: stillThere } = await api(`/books/${bookId}`, { token: ownerToken });
        assert.equal(stillThere, 200);
    });

    it("refuses updates to ownership and inventory fields", async () => {
        const { bookId } = await createBook(ownerToken);
        const protectedFields = ["_id", "addedBy", "addedByName", "availableCopies", "createdAt"];

        for (const field of protectedFields) {
            const { status } = await api(`/books/${bookId}`, {
                method: "PATCH",
                token: ownerToken,
                body: { [field]: "tampered" },
            });
            assert.equal(status, 400, `${field} must not be updatable`);
        }

        const { payload } = await api(`/books/${bookId}`, { token: ownerToken });
        assert.equal(payload.data.addedBy, "owner@example.com");
        assert.equal(payload.data.availableCopies, 3);
    });

    it("only lists your own books on /my-books/:email", async () => {
        await createBook(ownerToken);

        const denied = await api(`/my-books/${encodeURIComponent("stranger@example.com")}`, {
            token: ownerToken,
        });
        assert.equal(denied.status, 403);

        const allowed = await api(`/my-books/${encodeURIComponent("owner@example.com")}`, {
            token: ownerToken,
        });
        assert.equal(allowed.status, 200);
        assert.equal(allowed.payload.data.length, 1);
        assert.equal(allowed.payload.data[0].addedBy, "owner@example.com");
    });
});
