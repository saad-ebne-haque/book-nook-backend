import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    api,
    borrowBook,
    createBook,
    createToken,
    futureReturnDate,
    resetDatabase,
    startTestEnvironment,
    stopTestEnvironment,
} from "./helpers.js";

describe("borrow and return", () => {
    let borrowerToken;
    let otherToken;

    before(async () => {
        await startTestEnvironment();
        borrowerToken = await createToken({ email: "borrower@example.com", name: "Borrower" });
        otherToken = await createToken({ email: "other@example.com", name: "Other Reader" });
    });

    after(async () => {
        await stopTestEnvironment();
    });

    beforeEach(async () => {
        await resetDatabase();
    });

    it("borrowing decreases copies and stores the borrow record", async () => {
        const { bookId } = await createBook(borrowerToken);
        const returnDate = futureReturnDate();

        const { status, payload } = await borrowBook(borrowerToken, bookId, returnDate);
        assert.equal(status, 201);
        assert.equal(payload.success, true);

        const { payload: book } = await api(`/books/${bookId}`, { token: borrowerToken });
        assert.equal(book.data.availableCopies, 2);

        const { payload: borrows } = await api("/borrows", { token: borrowerToken });
        assert.equal(borrows.data.length, 1);

        const record = borrows.data[0];
        assert.equal(record.bookId, bookId);
        assert.equal(record.title, "The Silent Library");
        assert.equal(record.image, "https://example.com/covers/silent-library.jpg");
        assert.equal(record.borrowerEmail, "borrower@example.com");
        assert.equal(record.returnDate, returnDate);
        assert.match(record.borrowedDate, /^\d{4}-\d{2}-\d{2}$/);
    });

    it("blocks a duplicate borrow without touching copies again", async () => {
        const { bookId } = await createBook(borrowerToken);
        await borrowBook(borrowerToken, bookId);

        const { status, payload } = await borrowBook(borrowerToken, bookId);
        assert.equal(status, 409);
        assert.equal(payload.success, false);

        const { payload: book } = await api(`/books/${bookId}`, { token: borrowerToken });
        assert.equal(book.data.availableCopies, 2, "a rejected borrow must not decrement copies");

        const { payload: borrows } = await api("/borrows", { token: borrowerToken });
        assert.equal(borrows.data.length, 1);
    });

    it("lets exactly one of two concurrent borrows of the same book win", async () => {
        const { bookId } = await createBook(borrowerToken);

        const results = await Promise.all([
            borrowBook(borrowerToken, bookId),
            borrowBook(borrowerToken, bookId),
        ]);
        const statuses = results.map((result) => result.status).sort((a, b) => a - b);
        assert.deepEqual(statuses, [201, 409]);

        const { payload: book } = await api(`/books/${bookId}`, { token: borrowerToken });
        assert.equal(book.data.availableCopies, 2, "copies must be decremented exactly once");

        const { payload: borrows } = await api("/borrows", { token: borrowerToken });
        assert.equal(borrows.data.length, 1, "only one borrow record may exist");
    });

    it("does not create a record when no copies are available", async () => {
        const { bookId } = await createBook(borrowerToken, { totalCopies: 1, availableCopies: 0 });

        const { status } = await borrowBook(borrowerToken, bookId);
        assert.equal(status, 409);

        const { payload: borrows } = await api("/borrows", { token: borrowerToken });
        assert.equal(borrows.data.length, 0);
    });

    it("rejects an invalid or unknown book id", async () => {
        const invalid = await borrowBook(borrowerToken, "not-an-object-id");
        assert.equal(invalid.status, 400);

        const unknown = await borrowBook(borrowerToken, "653f1f1f1f1f1f1f1f1f1f1f");
        assert.equal(unknown.status, 404);
    });

    it("rejects a return date in the past", async () => {
        const { bookId } = await createBook(borrowerToken);

        const { status } = await borrowBook(borrowerToken, bookId, "2020-01-01");
        assert.equal(status, 400);

        const { payload: borrows } = await api("/borrows", { token: borrowerToken });
        assert.equal(borrows.data.length, 0);
    });

    it("lets a different user borrow the same book", async () => {
        const { bookId } = await createBook(borrowerToken);
        await borrowBook(borrowerToken, bookId);

        const { status } = await borrowBook(otherToken, bookId);
        assert.equal(status, 201);

        const { payload: book } = await api(`/books/${bookId}`, { token: borrowerToken });
        assert.equal(book.data.availableCopies, 1);

        const { payload: otherBorrows } = await api("/borrows", { token: otherToken });
        assert.equal(otherBorrows.data.length, 1);
        assert.equal(otherBorrows.data[0].borrowerEmail, "other@example.com");
    });

    it("returning restores copies and removes the record", async () => {
        const { bookId } = await createBook(borrowerToken);
        await borrowBook(borrowerToken, bookId);
        const { payload: borrows } = await api("/borrows", { token: borrowerToken });
        const recordId = borrows.data[0]._id;

        const { status } = await api(`/borrows/${recordId}`, {
            method: "DELETE",
            token: borrowerToken,
        });
        assert.equal(status, 200);

        const { payload: book } = await api(`/books/${bookId}`, { token: borrowerToken });
        assert.equal(book.data.availableCopies, 3);

        const { payload: remaining } = await api("/borrows", { token: borrowerToken });
        assert.equal(remaining.data.length, 0);
    });

    it("does not restore copies twice when the same record is returned twice", async () => {
        const { bookId } = await createBook(borrowerToken);
        await borrowBook(borrowerToken, bookId);
        const { payload: borrows } = await api("/borrows", { token: borrowerToken });
        const recordId = borrows.data[0]._id;

        const { status: first } = await api(`/borrows/${recordId}`, {
            method: "DELETE",
            token: borrowerToken,
        });
        assert.equal(first, 200);

        const { status: second } = await api(`/borrows/${recordId}`, {
            method: "DELETE",
            token: borrowerToken,
        });
        assert.equal(second, 404);

        const { payload: book } = await api(`/books/${bookId}`, { token: borrowerToken });
        assert.equal(book.data.availableCopies, 3, "a failed return must not change copies");
    });

    it("does not let another user return someone else's borrow", async () => {
        const { bookId } = await createBook(borrowerToken);
        await borrowBook(borrowerToken, bookId);
        const { payload: borrows } = await api("/borrows", { token: borrowerToken });
        const recordId = borrows.data[0]._id;

        const { status } = await api(`/borrows/${recordId}`, {
            method: "DELETE",
            token: otherToken,
        });
        assert.equal(status, 404);

        const { payload: mine } = await api("/borrows", { token: borrowerToken });
        assert.equal(mine.data.length, 1, "the record must survive a stranger's return attempt");

        const { payload: book } = await api(`/books/${bookId}`, { token: borrowerToken });
        assert.equal(book.data.availableCopies, 2, "copies must stay unchanged");
    });

    it("keeps each user's borrow list separate", async () => {
        const { bookId } = await createBook(borrowerToken);
        await borrowBook(borrowerToken, bookId);

        const { payload: mine } = await api("/borrows", { token: borrowerToken });
        assert.equal(mine.data.length, 1);

        const { payload: theirs } = await api("/borrows", { token: otherToken });
        assert.equal(theirs.data.length, 0);
    });

    it("allows borrowing the same book again after returning it", async () => {
        const { bookId } = await createBook(borrowerToken);
        await borrowBook(borrowerToken, bookId);
        const { payload: borrows } = await api("/borrows", { token: borrowerToken });
        await api(`/borrows/${borrows.data[0]._id}`, {
            method: "DELETE",
            token: borrowerToken,
        });

        const { status } = await borrowBook(borrowerToken, bookId);
        assert.equal(status, 201);

        const { payload: book } = await api(`/books/${bookId}`, { token: borrowerToken });
        assert.equal(book.data.availableCopies, 2);
    });
});
