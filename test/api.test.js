import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { createApp } from '../lib/app.js';

class FakeCollection {
    constructor(documents = []) {
        this.documents = documents;
    }

    find(query = {}) {
        let results = this.documents.filter((document) => matches(document, query));
        const cursor = {
            sort(sortFields) {
                results = results.sort((left, right) => {
                    for (const [field, direction] of Object.entries(sortFields)) {
                        const leftValue = getValue(left, field);
                        const rightValue = getValue(right, field);
                        const comparison = compare(leftValue, rightValue);
                        if (comparison !== 0) {
                            return comparison * direction;
                        }
                    }
                    return 0;
                });
                return cursor;
            },
            limit(count) {
                results = results.slice(0, count);
                return cursor;
            },
            async toArray() {
                return results;
            },
        };
        return cursor;
    }

    async findOne(query) {
        return this.documents.find((document) => matches(document, query)) ?? null;
    }

    async insertOne(document) {
        if (!document._id) {
            document._id = new ObjectId();
        }
        this.documents.push(document);
        return { insertedId: document._id };
    }

    async updateOne(query, update) {
        const document = this.documents.find((item) => matches(item, query));
        if (!document) {
            return { matchedCount: 0, modifiedCount: 0 };
        }

        for (const [field, value] of Object.entries(update.$set ?? {})) {
            document[field] = value;
        }
        for (const [field, value] of Object.entries(update.$inc ?? {})) {
            document[field] = (document[field] ?? 0) + value;
        }
        return { matchedCount: 1, modifiedCount: 1 };
    }

    async deleteOne(query) {
        const index = this.documents.findIndex((document) => matches(document, query));
        if (index === -1) {
            return { deletedCount: 0 };
        }
        this.documents.splice(index, 1);
        return { deletedCount: 1 };
    }
}

test('book and borrow API routes work with the frontend response format', async () => {
    const firstBookId = new ObjectId();
    const secondBookId = new ObjectId();
    const booksCollection = new FakeCollection([
        {
            _id: firstBookId,
            title: 'Older book',
            author: 'A. Writer',
            category: 'Fiction',
            description: 'A story.',
            cover: 'https://example.com/older.jpg',
            availableCopies: 1,
            addedBy: { name: 'Hero', email: 'hero@pro.soro' },
            createdAt: new Date('2024-01-01'),
        },
        {
            _id: secondBookId,
            title: 'Newer book',
            author: 'B. Writer',
            category: 'Science',
            description: 'A newer story.',
            availableCopies: 2,
            addedBy: { name: 'Reader', email: 'reader@example.com' },
            createdAt: new Date('2025-01-01'),
        },
    ]);
    const borrowsCollection = new FakeCollection();
    const server = createApp({ booksCollection, borrowsCollection }).listen(0);
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    async function request(path, options = {}) {
        const response = await fetch(`${baseUrl}${path}`, {
            ...options,
            headers: {
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...options.headers,
            },
        });
        return { status: response.status, body: await response.json() };
    }

    try {
        const latestBooks = await request('/books?limit=1');
        assert.equal(latestBooks.status, 200);
        assert.equal(latestBooks.body.data[0].title, 'Newer book');

        const myBooks = await request('/my-books/HERO%40PRO.SORO');
        assert.equal(myBooks.status, 200);
        assert.equal(myBooks.body.data[0].title, 'Older book');

        const created = await request('/books', {
            method: 'POST',
            body: JSON.stringify({
                title: 'New title',
                author: 'C. Writer',
                category: 'History',
                description: 'A new book.',
                addedBy: { name: 'Hero', email: 'hero@pro.soro' },
            }),
        });
        assert.equal(created.status, 201);
        assert.ok(created.body.data.createdAt);
        assert.equal(created.body.data.availableCopies, 1);

        const updated = await request(`/books/${firstBookId}`, {
            method: 'PATCH',
            body: JSON.stringify({ title: 'Updated title' }),
        });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.data.title, 'Updated title');

        const invalidId = await request('/books/not-an-object-id');
        assert.equal(invalidId.status, 400);

        const borrowed = await request('/borrows', {
            method: 'POST',
            body: JSON.stringify({ bookId: firstBookId.toString(), userEmail: 'reader@example.com' }),
        });
        assert.equal(borrowed.status, 201);
        assert.equal(booksCollection.documents[0].availableCopies, 0);

        const userBorrows = await request('/borrows?email=reader%40example.com');
        assert.equal(userBorrows.status, 200);
        assert.equal(userBorrows.body.data.length, 1);
        assert.equal(userBorrows.body.data[0].bookId, firstBookId.toString());

        const deleteWhileBorrowed = await request(`/books/${firstBookId}`, { method: 'DELETE' });
        assert.equal(deleteWhileBorrowed.status, 409);

        const returned = await request(`/borrows/${borrowed.body.data._id}`, { method: 'DELETE' });
        assert.equal(returned.status, 200);
        assert.equal(booksCollection.documents[0].availableCopies, 1);
        assert.equal(borrowsCollection.documents.length, 0);

        const deleted = await request(`/books/${firstBookId}`, { method: 'DELETE' });
        assert.equal(deleted.status, 200);
        assert.equal(booksCollection.documents.some((book) => book._id.equals(firstBookId)), false);

        const invalidBook = await request('/books', {
            method: 'POST',
            body: JSON.stringify({ title: 'Incomplete' }),
        });
        assert.equal(invalidBook.status, 400);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
});

function matches(document, query) {
    return Object.entries(query).every(([field, expected]) => {
        const actual = getValue(document, field);
        if (expected && typeof expected === 'object' && '$gt' in expected) {
            return actual > expected.$gt;
        }
        if (actual instanceof ObjectId && expected instanceof ObjectId) {
            return actual.equals(expected);
        }
        return actual === expected;
    });
}

function getValue(document, path) {
    return path.split('.').reduce((value, key) => value?.[key], document);
}

function compare(left, right) {
    const leftValue = left instanceof ObjectId ? left.toString() : left;
    const rightValue = right instanceof ObjectId ? right.toString() : right;
    if (leftValue === rightValue) {
        return 0;
    }
    if (leftValue === undefined) {
        return -1;
    }
    if (rightValue === undefined) {
        return 1;
    }
    return leftValue < rightValue ? -1 : 1;
}
