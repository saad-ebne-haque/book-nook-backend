import { ObjectId } from 'mongodb';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const bookTextFields = ['title', 'author', 'category', 'description', 'cover', 'language'];
const bookNumberFields = ['publishedYear', 'availableCopies', 'rating'];

export function isValidEmail(email) {
    return typeof email === 'string' && emailPattern.test(email.trim());
}

export function isValidObjectId(id) {
    return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
}

export function normalizeNewBook(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { error: 'Book details are required.' };
    }

    const book = {};

    for (const field of bookTextFields) {
        if (input[field] !== undefined) {
            if (typeof input[field] !== 'string') {
                return { error: `${field} must be a string.` };
            }
            if (input[field].trim()) {
                book[field] = input[field].trim();
            }
        }
    }

    for (const field of bookNumberFields) {
        if (input[field] !== undefined) {
            book[field] = input[field];
        }
    }

    const requiredFields = ['title', 'author', 'category', 'description'];
    if (requiredFields.some((field) => !book[field])) {
        return { error: 'Title, author, category, and description are required.' };
    }

    if (!input.addedBy || typeof input.addedBy !== 'object' || Array.isArray(input.addedBy)) {
        return { error: 'The book owner name and email are required.' };
    }

    const name = typeof input.addedBy.name === 'string' ? input.addedBy.name.trim() : '';
    const email = typeof input.addedBy.email === 'string' ? input.addedBy.email.trim().toLowerCase() : '';
    if (!name || !isValidEmail(email)) {
        return { error: 'A valid book owner name and email are required.' };
    }

    book.addedBy = { name, email };
    book.availableCopies = input.availableCopies === undefined ? 1 : input.availableCopies;
    book.cover = book.cover ?? '';
    book.language = book.language ?? 'English';
    book.publishedYear = book.publishedYear ?? new Date().getFullYear();
    book.rating = book.rating ?? 0;

    const numericError = validateBookNumbers(book, false);
    if (numericError) {
        return { error: numericError };
    }

    return { book };
}

export function normalizeBookUpdate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { error: 'Book updates are required.' };
    }

    const updates = {};

    for (const field of bookTextFields) {
        if (input[field] !== undefined) {
            if (typeof input[field] !== 'string' || !input[field].trim()) {
                return { error: `${field} must be a non-empty string.` };
            }
            updates[field] = input[field].trim();
        }
    }

    for (const field of bookNumberFields) {
        if (input[field] !== undefined) {
            updates[field] = input[field];
        }
    }

    if (Object.keys(updates).length === 0) {
        return { error: 'Provide at least one valid book field to update.' };
    }

    const numericError = validateBookNumbers(updates, true);
    if (numericError) {
        return { error: numericError };
    }

    return { updates };
}

function validateBookNumbers(book, isUpdate) {
    if (book.publishedYear !== undefined &&
        (!Number.isInteger(book.publishedYear) || book.publishedYear < 0)) {
        return 'Published year must be a non-negative whole number.';
    }

    if (book.availableCopies !== undefined &&
        (!Number.isInteger(book.availableCopies) || book.availableCopies < (isUpdate ? 0 : 1))) {
        return `Available copies must be a whole number of at least ${isUpdate ? 0 : 1}.`;
    }

    if (book.rating !== undefined &&
        (typeof book.rating !== 'number' || book.rating < 0 || book.rating > 5)) {
        return 'Rating must be a number between 0 and 5.';
    }

    return null;
}

export function toObjectId(id) {
    return new ObjectId(id);
}
