import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MongoClient, ObjectId ,} from 'mongodb';


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const client = new MongoClient(process.env.MONGODB_SECRET_URI);
export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}

const connectedClient = await connectToMongoDB();
const db = connectedClient.db('book-nook');
const booksCollection = db.collection('books');

app.get('/', (req, res) => {
    res.send({ success: true, message: 'Book Nook backend server connected' });
});


app.get('/books', async (req, res) => {

    const books = await booksCollection.find().toArray();
    res.send({ success: true, message: 'Books retrieved successfully', data: books });

});


app.get('/books/:id', async (req, res) => {
    const bookId = req.params.id;
    const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });

    if (!book) {
        return res.status(404).send({ success: false, message: 'Book not found' });
    }

    res.send({ success: true, message: 'Book retrieved successfully', data: book });
});

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`this server is running on PORT: ${PORT}`);
    });
}

export default app;