import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { createApp } from './lib/app.js';

const PORT = process.env.PORT || 5000;
const mongoUri = process.env.MONGODB_SECRET_URI;

if (!mongoUri) {
    throw new Error('MONGODB_SECRET_URI is required to start the backend.');
}

const client = new MongoClient(mongoUri);
export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log('You successfully connected to MongoDB!');
        return client;
    } catch (err) {
        console.error('Could not connect to MongoDB:', err);
        throw err;
    }
}

const connectedClient = await connectToMongoDB();
const db = connectedClient.db('book-nook');
const booksCollection = db.collection('books');
const borrowsCollection = db.collection('borrows');
const app = createApp({ booksCollection, borrowsCollection });

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`This server is running on PORT: ${PORT}`);
    });
}

export default app;