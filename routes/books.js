import {
    isValidEmail,
    isValidObjectId,
    normalizeBookUpdate,
    normalizeNewBook,
    toObjectId,
} from '../validation.js';

export function registerBookRoutes(app, booksCollection, borrowsCollection) {
    app.get('/books', async (req, res) => {
        let cursor = booksCollection.find().sort({ createdAt: -1, _id: -1 });
        if (req.query.limit !== undefined) {
            const limit = Number(req.query.limit);
            if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
                return res.status(400).send({ success: false, message: 'Limit must be a whole number from 1 to 100.' });
            }
            cursor = cursor.limit(limit);
        }

        const books = await cursor.toArray();
        res.send({ success: true, message: 'Books retrieved successfully', data: books });
    });

    app.get('/books/:id', async (req, res) => {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).send({ success: false, message: 'Book ID is invalid.' });
        }

        const book = await booksCollection.findOne({ _id: toObjectId(req.params.id) });
        if (!book) {
            return res.status(404).send({ success: false, message: 'Book not found' });
        }

        res.send({ success: true, message: 'Book retrieved successfully', data: book });
    });

    app.get('/my-books/:email', async (req, res) => {
        const email = req.params.email.trim().toLowerCase();
        if (!isValidEmail(email)) {
            return res.status(400).send({ success: false, message: 'A valid email is required.' });
        }

        const myBooks = await booksCollection.find({ 'addedBy.email': email }).toArray();
        if (myBooks.length === 0) {
            return res.status(404).send({ success: false, message: 'My books not found' });
        }

        res.send({ success: true, message: 'My books retrieved successfully', data: myBooks });
    });

    app.post('/books', async (req, res) => {
        const result = normalizeNewBook(req.body);
        if (result.error) {
            return res.status(400).send({ success: false, message: result.error });
        }

        const book = { ...result.book, createdAt: new Date() };
        const insertResult = await booksCollection.insertOne(book);
        res.status(201).send({
            success: true,
            message: 'Book added successfully',
            data: { _id: insertResult.insertedId, ...book },
        });
    });

    app.patch('/books/:id', async (req, res) => {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).send({ success: false, message: 'Book ID is invalid.' });
        }

        const result = normalizeBookUpdate(req.body);
        if (result.error) {
            return res.status(400).send({ success: false, message: result.error });
        }

        const bookId = toObjectId(req.params.id);
        const updateResult = await booksCollection.updateOne({ _id: bookId }, { $set: result.updates });
        if (updateResult.matchedCount === 0) {
            return res.status(404).send({ success: false, message: 'Book not found' });
        }

        const book = await booksCollection.findOne({ _id: bookId });
        res.send({ success: true, message: 'Book updated successfully', data: book });
    });

    app.delete('/books/:id', async (req, res) => {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).send({ success: false, message: 'Book ID is invalid.' });
        }

        const bookId = toObjectId(req.params.id);
        const book = await booksCollection.findOne({ _id: bookId });
        if (!book) {
            return res.status(404).send({ success: false, message: 'Book not found' });
        }

        const activeBorrow = await borrowsCollection.findOne({ bookId: bookId.toString() });
        if (activeBorrow) {
            return res.status(409).send({
                success: false,
                message: 'Return this book before deleting it.',
            });
        }

        await booksCollection.deleteOne({ _id: bookId });
        res.send({ success: true, message: 'Book deleted successfully', data: book });
    });
}
