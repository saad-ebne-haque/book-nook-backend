import {
    isValidEmail,
    isValidObjectId,
    toObjectId,
} from '../validation.js';

const BORROW_DAYS = 14;

export function registerBorrowRoutes(app, booksCollection, borrowsCollection) {
    app.post('/borrows', async (req, res) => {
        const { bookId, userEmail } = req.body ?? {};
        const email = typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : '';

        if (!isValidObjectId(bookId) || !isValidEmail(email)) {
            return res.status(400).send({
                success: false,
                message: 'A valid book ID and user email are required.',
            });
        }

        const id = toObjectId(bookId);
        const book = await booksCollection.findOne({ _id: id });
        if (!book) {
            return res.status(404).send({ success: false, message: 'Book not found' });
        }

        const stockResult = await booksCollection.updateOne(
            { _id: id, availableCopies: { $gt: 0 } },
            { $inc: { availableCopies: -1 } },
        );
        if (stockResult.matchedCount === 0) {
            return res.status(409).send({ success: false, message: 'No copies of this book are available.' });
        }

        const borrowDate = new Date();
        const returnDate = new Date(borrowDate);
        returnDate.setDate(returnDate.getDate() + BORROW_DAYS);

        const borrow = {
            bookId: id.toString(),
            bookTitle: book.title,
            bookImage: book.cover ?? '',
            userEmail: email,
            borrowDate,
            returnDate,
        };

        try {
            const insertResult = await borrowsCollection.insertOne(borrow);
            res.status(201).send({
                success: true,
                message: 'Book borrowed successfully',
                data: { _id: insertResult.insertedId, ...borrow },
            });
        } catch (error) {
            await booksCollection.updateOne({ _id: id }, { $inc: { availableCopies: 1 } });
            throw error;
        }
    });

    app.get('/borrows', async (req, res) => {
        const emailValue = req.query.email ?? req.query.userEmail;
        const email = typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : '';
        if (!isValidEmail(email)) {
            return res.status(400).send({ success: false, message: 'A valid email query parameter is required.' });
        }

        const borrows = await borrowsCollection
            .find({ userEmail: email })
            .sort({ borrowDate: -1, _id: -1 })
            .toArray();
        res.send({ success: true, message: 'Borrowed books retrieved successfully', data: borrows });
    });

}
