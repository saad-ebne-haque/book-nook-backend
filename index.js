
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
        console.error("MongoDB connection failed", err);
        throw err;
    }
}

const connectedClient = await connectToMongoDB();
const db = connectedClient.db('book-nook');
const books = db.collection('books');
const borrows = db.collection('borrows');
/* ================MongoDB==================== */







app.get("/", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "Book Nook server running successfully",
        data: {
            name: "BookNook API",
        },
    });
});


app.get('/books', async (req, res) => {
    const allBooks = await books.find({}).toArray();
    return res.status(200).json({
        success: true,
        message: "Books retrieved successfully",
        data: allBooks,
    });
})

app.get('/books/:id', async (req, res) => {
    const id = req.params.id;
    // Check whether this ID has a valid MongoDB ObjectId format.
    const isIdValid = ObjectId.isValid(id);
    if (isIdValid === false) {
        return res.status(400).json({
            success: false,
            message: "Invalid book ID",
            data: null,
        });
    }

    const singleBook = await books.findOne({ _id: new ObjectId(id) });
    if (!singleBook) {
        return res.status(404).json({
            success: false,
            message: "Book not found",
            data: null,
        });
    }

    return res.status(200).json({
        success: true,
        message: "Book retrieved successfully",
        data: singleBook,
    });
})

app.post('/books', async (req, res) => {
    const newBook = req.body;
    if (newBook === null || newBook === undefined) {
        return res.status(400).json({
            success: false,
            message: "A book object is required",
            data: null,
        });
    }

    if (typeof newBook !== "object") {
        return res.status(400).json({
            success: false,
            message: "A book object is required",
            data: null,
        });
    }

    if (Array.isArray(newBook)) {
        return res.status(400).json({
            success: false,
            message: "A book object is required",
            data: null,
        });
    }

    if (Object.keys(newBook).length === 0) {
        return res.status(400).json({
            success: false,
            message: "A book object is required",
            data: null,
        });
    }

    const result = await books.insertOne(newBook);
    return res.status(201).json({
        success: true,
        message: "Book added successfully",
        data: result,
    });

})

app.patch('/books/:id', async (req, res) => {
    const id = req.params.id;
    const updatedBook = req.body;
    const isIdValid = ObjectId.isValid(id);
    if (isIdValid === false) {
        return res.status(400).json({
            success: false,
            message: "Invalid book ID",
            data: null,
        });
    }

    if (updatedBook === null || updatedBook === undefined) {
        return res.status(400).json({
            success: false,
            message: "A valid book update is required",
            data: null,
        });
    }

    if (typeof updatedBook !== "object") {
        return res.status(400).json({
            success: false,
            message: "A valid book update is required",
            data: null,
        });
    }

    if (Array.isArray(updatedBook)) {
        return res.status(400).json({
            success: false,
            message: "A valid book update is required",
            data: null,
        });
    }

    if (Object.keys(updatedBook).length === 0) {
        return res.status(400).json({
            success: false,
            message: "A valid book update is required",
            data: null,
        });
    }

    if ("_id" in updatedBook) {
        return res.status(400).json({
            success: false,
            message: "A valid book update is required",
            data: null,
        });
    }

    const result = await books.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedBook }
    );
    if (result.matchedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "Book not found",
            data: null,
        });
    }

    return res.status(200).json({
        success: true,
        message: "Book updated successfully",
        data: result,
    });

});

app.delete('/books/:id', async (req, res) => {
    const id = req.params.id;
    const isIdValid = ObjectId.isValid(id);
    if (isIdValid === false) {
        return res.status(400).json({
            success: false,
            message: "Invalid book ID",
            data: null,
        });
    }

    const result = await books.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "Book not found",
            data: null,
        });
    }

    return res.status(200).json({
        success: true,
        message: "Book deleted successfully",
        data: result,
    });

});

app.post('/borrows', async (req, res) => {
    try {
        const borrowedBook = req.body;

        if (borrowedBook === null || borrowedBook === undefined) {
            return res.status(400).json({
                success: false,
                message: "A valid book ID and borrower email are required",
                data: null,
            });
        }

        if (typeof borrowedBook !== "object") {
            return res.status(400).json({
                success: false,
                message: "A valid book ID and borrower email are required",
                data: null,
            });
        }

        if (Array.isArray(borrowedBook)) {
            return res.status(400).json({
                success: false,
                message: "A valid book ID and borrower email are required",
                data: null,
            });
        }

        if (typeof borrowedBook.bookId !== "string") {
            return res.status(400).json({
                success: false,
                message: "A valid book ID and borrower email are required",
                data: null,
            });
        }

        const isBookIdValid = ObjectId.isValid(borrowedBook.bookId);
        if (isBookIdValid === false) {
            return res.status(400).json({
                success: false,
                message: "A valid book ID and borrower email are required",
                data: null,
            });
        }

        if (typeof borrowedBook.borrowerEmail !== "string") {
            return res.status(400).json({
                success: false,
                message: "A valid book ID and borrower email are required",
                data: null,
            });
        }

        if (borrowedBook.borrowerEmail.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "A valid book ID and borrower email are required",
                data: null,
            });
        }

        const alreadyBorrowed = await borrows.findOne({
            bookId: borrowedBook.bookId,
            borrowerEmail: borrowedBook.borrowerEmail,
        });
        if (alreadyBorrowed) {
            return res.status(409).json({
                success: false,
                message: "You have already borrowed this book",
                data: null,
            });
        }

        const updateBook = await books.updateOne(
            {
                _id: new ObjectId(borrowedBook.bookId),
                $expr: {
                    $gt: [{ $toInt: '$availableCopies' }, 0],
                },
            },
            [
                {
                    $set: {
                        availableCopies: {
                            $toString: {
                                $subtract: [
                                    { $toInt: '$availableCopies' },
                                    1,
                                ]
                            }
                        }
                    }
                }
            ]
        );
        if (updateBook.modifiedCount === 0) {
            return res.status(409).json({
                success: false,
                message: "Book not found or unavailable",
                data: null,
            });
        }

        const result = await borrows.insertOne(borrowedBook);
        return res.status(201).json({
            success: true,
            message: "Book borrowed successfully",
            data: result,
        });
    } catch (err) {
        console.error("Failed to borrow book", err);
        return res.status(500).json({
            success: false,
            message: "Failed to borrow book",
            data: null,
        });
    }
})


app.delete('/borrows/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const isBorrowIdValid = ObjectId.isValid(id);
        if (isBorrowIdValid === false) {
            return res.status(400).json({
                success: false,
                message: "Invalid borrow ID",
                data: null,
            });
        }

        const borrow = await borrows.findOne({ _id: new ObjectId(id) });
        if (!borrow) {
            return res.status(404).json({
                success: false,
                message: "Borrow record not found",
                data: null,
            });
        }

        if (typeof borrow.bookId !== "string") {
            throw new Error("Borrow record contains an invalid book ID");
        }

        const isBookIdValid = ObjectId.isValid(borrow.bookId);
        if (isBookIdValid === false) {
            throw new Error("Borrow record contains an invalid book ID");
        }

        const updateBook = await books.updateOne(
            { _id: new ObjectId(borrow.bookId) },
            [{
                $set: {
                    availableCopies: {
                        $toString: {
                            $add: [
                                { $toInt: '$availableCopies' }, 1
                            ]
                        }
                    }
                }
            }]
        );
        if (updateBook.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Book not found",
                data: null,
            });
        }

        const result = await borrows.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Borrow record not found",
                data: null,
            });
        }

        return res.status(200).json({
            success: true,
            message: "Book returned successfully",
            data: {
                updateBook,
                result,
            },
        });
    } catch (err) {
        console.error("Failed to return book", err);
        return res.status(500).json({
            success: false,
            message: "Failed to return book",
            data: null,
        });
    }
})

app.get("/borrows", async (req, res) => {
    try {
        const { borrowerEmail } = req.query;

        if (typeof borrowerEmail !== "string") {
            return res.status(400).json({
                success: false,
                message: "A borrower email is required",
                data: null,
            });
        }

        if (borrowerEmail.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "A borrower email is required",
                data: null,
            });
        }

        const result = await borrows
            .find({ borrowerEmail })
            .toArray();

        return res.status(200).json({
            success: true,
            message: "Borrowed books retrieved successfully",
            data: result,
        });
    } catch (err) {
        console.error("Failed to fetch borrowed books", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch borrowed books",
            data: null,
        });
    }
});

app.get('/my-books/:email', async (req, res) => {
    const email = req.params.email;
    const myBooks = await books.find({ addedBy: email }).sort({ _id: -1 }).toArray();
    return res.status(200).json({
        success: true,
        message: "Your books retrieved successfully",
        data: myBooks,
    });
})

app.use((req, res) => {
    return res.status(404).json({
        success: false,
        message: "Route not found",
        data: null,
    });
});

app.use((err, req, res, next) => {
    console.error("API request failed", err);

    if (res.headersSent) {
        return next(err);
    }

    if (err.type === "entity.parse.failed") {
        return res.status(400).json({
            success: false,
            message: "Invalid JSON request body",
            data: null,
        });
    }
    if (err.type === "entity.too.large") {
        return res.status(413).json({
            success: false,
            message: "Request body is too large",
            data: null,
        });
    }

    return res.status(500).json({
        success: false,
        message: "Internal server error",
        data: null,
    });
});

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`This server is running on PORT: ${PORT}`);
    });
}

export default app;
