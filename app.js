import cors from 'cors';
import express from 'express';
import { registerBookRoutes } from './routes/books.js';
import { registerBorrowRoutes } from './routes/borrows.js';
import { registerReturnRoutes } from './routes/returns.js';

export function createApp({ booksCollection, borrowsCollection }) {
    const app = express();

    app.use(cors());
    app.use(express.json());

    app.get('/', (_req, res) => {
        res.send({ success: true, message: 'Book Nook backend server connected' });
    });

    registerBookRoutes(app, booksCollection, borrowsCollection);
    registerBorrowRoutes(app, booksCollection, borrowsCollection);
    registerReturnRoutes(app, booksCollection, borrowsCollection);

    app.use((_req, res) => {
        res.status(404).send({ success: false, message: 'Route not found' });
    });

    app.use((err, _req, res, _next) => {
        console.error('API request failed:', err);
        const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500
            ? err.status
            : 500;
        const message = status === 400
            ? 'Request body must contain valid JSON.'
            : 'An unexpected server error occurred.';
        res.status(status).send({ success: false, message });
    });

    return app;
}
