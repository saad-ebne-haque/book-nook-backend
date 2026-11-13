
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from 'mongodb';
import "dotenv/config";


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());



/* ================MongoDB==================== */

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
const books = db.collection('books');
const borrowedBooks = db.collection('borrowed-books');
/* ================MongoDB==================== */







app.get("/", (req, res) => {
    res.send({
        success: true,
        message: "Book Nook server running successfully",
    });
});


app.get('/books', async (req, res) => {

    const allBooks = await books.find({}).toArray();
    res.send(allBooks);
})

app.get('/books/:id', async (req, res) => {

    const id = req.params.id;

    const singleBook = await books.findOne({ _id: new ObjectId(id) });
    res.send(singleBook);

})

app.post('/books', async (req, res) => {

    const newBook = req.body;
    const result = await books.insertOne(newBook);
    res.send(result);

})

app.patch('/books/:id', async (req, res) => {

    const id = req.params.id;
    const updatedBook = req.body;
    const query = { _id: new ObjectId(id) };

    const result = await books.updateOne(query, { $set: updatedBook });
    res.send(result);


});

app.delete('/books/:id', async (req, res) => {

    const id = req.params.id;
    const query = { _id: new ObjectId(id) };

    const result = await books.deleteOne(query);
    res.send(result);


});

app.post('/borrowed-books', async (req, res) => {
    try {
        const newBorrowedBook = req.body;

        const alreadyBorrowed = await borrowedBooks.findOne({
            bookId: newBorrowedBook.bookId,
            borrowerEmail: newBorrowedBook.borrowerEmail
        });

        if (alreadyBorrowed) {
            return res.status(409).send({
                success: false,
                message: "You have already borrowed this book!"
            });

            // throw new Error('You have already borrowed this book!')

        }
        const result = await borrowedBooks.insertOne(newBorrowedBook);

        res.status(201).send({
            success: true,
            message: "Book borrowed successfully!",
            result
        })
    } catch (error) {
        res.status(500).send({
            success: false,
            message: "Something went wrong!",
            error: error.message
        });
    }
})


app.get('/my-books/:email', async (req, res) => {
    const email = req.params.email;
    const myBooks = await books.find({ addedBy: email }).sort({ _id: -1 }).toArray();
    res.send(myBooks);
})

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`This server is running on PORT: ${PORT}`);
    });
}

export default app;
