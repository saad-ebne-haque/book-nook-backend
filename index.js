
import express from "express";
import cors from "cors";
import { MongoClient } from 'mongodb';
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

/* ================MongoDB==================== */







app.get("/", (req, res) => {
    res.send({
        success: true,
        message: "Book Nook server running successfully",
    });
});


app.get('/books', async (req, res) => {

    const allBooks = await books.find({}).sort({ _id: -1 }).toArray();
    res.send(allBooks);
})




if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`This server is running on PORT: ${PORT}`);
    });
}

export default app;
