import { isValidObjectId, toObjectId } from '../lib/validation.js';

export function registerReturnRoutes(app, booksCollection, borrowsCollection) {
    app.delete('/borrows/:id', async (req, res) => {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).send({ success: false, message: 'Borrow ID is invalid.' });
        }

        const borrowId = toObjectId(req.params.id);
        const borrow = await borrowsCollection.findOne({ _id: borrowId });
        if (!borrow) {
            return res.status(404).send({ success: false, message: 'Borrow record not found' });
        }

        const deleteResult = await borrowsCollection.deleteOne({ _id: borrowId });
        if (deleteResult.deletedCount === 0) {
            return res.status(404).send({ success: false, message: 'Borrow record not found' });
        }

        let stockResult;
        try {
            stockResult = await booksCollection.updateOne(
                { _id: toObjectId(borrow.bookId) },
                { $inc: { availableCopies: 1 } },
            );
        } catch (error) {
            await borrowsCollection.insertOne(borrow);
            throw error;
        }

        if (stockResult.matchedCount === 0) {
            await borrowsCollection.insertOne(borrow);
            return res.status(409).send({
                success: false,
                message: 'The book record no longer exists, so it could not be returned.',
            });
        }

        res.send({ success: true, message: 'Book returned successfully', data: borrow });
    });
}
