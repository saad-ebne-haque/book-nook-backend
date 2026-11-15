
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from 'mongodb';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import "dotenv/config";


const app = express();
const PORT = process.env.PORT || 5000;
const betterAuthURL = process.env.BETTER_AUTH_URL;

if (!betterAuthURL) {
    throw new Error("BETTER_AUTH_URL must be configured for API JWT verification");
}

const authURL = new URL(betterAuthURL);
const authPath = authURL.pathname.replace(/\/+$/, "");
const authBasePath = authPath.endsWith("/api/auth")
    ? authPath
    : `${authPath}/api/auth`;
authURL.pathname = `${authBasePath}/jwks`;
authURL.search = "";
authURL.hash = "";
const authJwks = createRemoteJWKSet(authURL);

app.use(cors());
app.use(express.json());

async function requireAuth(req, res, next) {
    const authorization = req.get("authorization");
    const match = authorization?.match(/^Bearer\s+(.+)$/i);

    if (!match) {
        return res.status(401).json({
            success: false,
            message: "A valid bearer token is required",
            data: null,
        });
    }

    try {
        const { payload } = await jwtVerify(match[1], authJwks, {
            issuer: betterAuthURL,
            audience: betterAuthURL,
        });

        if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
            return res.status(401).json({
                success: false,
                message: "The bearer token does not contain a valid user",
                data: null,
            });
        }

         
        req.auth = {
            userId: payload.sub,
            email: payload.email,
            name: typeof payload.name === "string" ? payload.name : null,
        };
        return next();
    } catch (error) {
        if (error instanceof joseErrors.JWKSTimeout) {
            console.error("Better Auth JWKS endpoint timed out", error);
            return res.status(503).json({
                success: false,
                message: "Authentication service is temporarily unavailable",
                data: null,
            });
        }

        if (error instanceof joseErrors.JOSEError) {
            return res.status(401).json({
                success: false,
                message: "The bearer token is invalid or expired",
                data: null,
            });
        }

        console.error("JWT verification failed", error);
        return res.status(503).json({
            success: false,
            message: "Authentication service is temporarily unavailable",
            data: null,
        });
    }
}

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
await books.updateMany(
    { availableCopies: { $type: "string" } },
    [{ $set: { availableCopies: { $toInt: "$availableCopies" } } }]
);
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
    const cursor = books.find({});
    if (req.query.limit !== undefined) {
        if (typeof req.query.limit !== "string" || !/^[1-9]\d*$/.test(req.query.limit)) {
            return res.status(400).json({
                success: false,
                message: "Limit must be a positive integer",
                data: null,
            });
        }

        const limit = Number(req.query.limit);
        if (!Number.isSafeInteger(limit) || limit > 50) {
            return res.status(400).json({
                success: false,
                message: "Limit must be between 1 and 50",
                data: null,
            });
        }

        cursor.sort({ createdAt: -1, _id: -1 }).limit(limit);
    }

    const allBooks = await cursor.toArray();
    return res.status(200).json({
        success: true,
        message: "Books retrieved successfully",
        data: allBooks,
    });
})

app.get('/books/:id', requireAuth, async (req, res) => {
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

app.post('/books', requireAuth, async (req, res) => {
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

    if ("_id" in newBook) {
        return res.status(400).json({
            success: false,
            message: "A book ID cannot be supplied",
            data: null,
        });
    }

    if (!Number.isSafeInteger(newBook.availableCopies) || newBook.availableCopies < 0) {
        return res.status(400).json({
            success: false,
            message: "Available copies must be a non-negative integer",
            data: null,
        });
    }

    const bookToInsert = {
        ...newBook,
        addedBy: req.auth.email,
        addedByName: req.auth.name,
        createdAt: new Date().toISOString(),
    };
    const result = await books.insertOne(bookToInsert);
    return res.status(201).json({
        success: true,
        message: "Book added successfully",
        data: result,
    });

})

app.patch('/books/:id', requireAuth, async (req, res) => {
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

    const protectedFields = ["_id", "addedBy", "addedByName", "availableCopies", "createdAt"];
    if (protectedFields.some((field) => field in updatedBook)) {
        return res.status(400).json({
            success: false,
            message: "Book ownership and inventory fields cannot be updated",
            data: null,
        });
    }

    const result = await books.updateOne(
        { _id: new ObjectId(id), addedBy: req.auth.email },
        { $set: updatedBook }
    );
    if (result.matchedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "Book not found or you are not allowed to update it",
            data: null,
        });
    }

    return res.status(200).json({
        success: true,
        message: "Book updated successfully",
        data: result,
    });

});

app.delete('/books/:id', requireAuth, async (req, res) => {
    const id = req.params.id;
    const isIdValid = ObjectId.isValid(id);
    if (isIdValid === false) {
        return res.status(400).json({
            success: false,
            message: "Invalid book ID",
            data: null,
        });
    }

    const result = await books.deleteOne({
        _id: new ObjectId(id),
        addedBy: req.auth.email,
    });
    if (result.deletedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "Book not found or you are not allowed to delete it",
            data: null,
        });
    }

    return res.status(200).json({
        success: true,
        message: "Book deleted successfully",
        data: result,
    });

});

app.post('/borrows', requireAuth, async (req, res) => {
    try {
        const borrowedBook = req.body;

        if (borrowedBook === null || borrowedBook === undefined) {
            return res.status(400).json({
                success: false,
                message: "A valid book ID and return date are required",
                data: null,
            });
        }

        if (typeof borrowedBook !== "object") {
            return res.status(400).json({
                success: false,
                message: "A valid book ID and return date are required",
                data: null,
            });
        }

        if (Array.isArray(borrowedBook)) {
            return res.status(400).json({
                success: false,
                message: "A valid book ID and return date are required",
                data: null,
            });
        }

        if (typeof borrowedBook.bookId !== "string") {
            return res.status(400).json({
                success: false,
                message: "A valid book ID and return date are required",
                data: null,
            });
        }

        const isBookIdValid = ObjectId.isValid(borrowedBook.bookId);
        if (isBookIdValid === false) {
            return res.status(400).json({
                success: false,
                message: "A valid book ID and return date are required",
                data: null,
            });
        }

        if (typeof borrowedBook.returnDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(borrowedBook.returnDate)) {
            return res.status(400).json({
                success: false,
                message: "A valid return date is required",
                data: null,
            });
        }

        const returnDate = new Date(`${borrowedBook.returnDate}T00:00:00.000Z`);
        const todayDate = new Date().toISOString().slice(0, 10);
        if (
            Number.isNaN(returnDate.getTime())
            || returnDate.toISOString().slice(0, 10) !== borrowedBook.returnDate
            || borrowedBook.returnDate < todayDate
        ) {
            return res.status(400).json({
                success: false,
                message: "The return date must be today or later",
                data: null,
            });
        }

        const bookObjectId = new ObjectId(borrowedBook.bookId);
        const book = await books.findOne({ _id: bookObjectId });
        if (!book) {
            return res.status(404).json({
                success: false,
                message: "Book not found",
                data: null,
            });
        }

        const alreadyBorrowed = await borrows.findOne({
            bookId: borrowedBook.bookId,
            borrowerEmail: req.auth.email,
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
                _id: bookObjectId,
                availableCopies: { $gt: 0 },
            },
            { $inc: { availableCopies: -1 } }
        );
        if (updateBook.modifiedCount === 0) {
            return res.status(409).json({
                success: false,
                message: "Book not found or unavailable",
                data: null,
            });
        }

        const { _id: borrowedObjectId, ...bookData } = book;
        const borrowRecord = {
            ...bookData,
            bookId: borrowedObjectId.toString(),
            borrowerEmail: req.auth.email,
            borrowerName: req.auth.name,
            borrowedDate: todayDate,
            returnDate: borrowedBook.returnDate,
        };
        const result = await borrows.insertOne(borrowRecord);
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


app.delete('/borrows/:id', requireAuth, async (req, res) => {
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

        const borrow = await borrows.findOne({
            _id: new ObjectId(id),
            borrowerEmail: req.auth.email,
        });
        if (!borrow) {
            return res.status(404).json({
                success: false,
                message: "Borrow record not found or you are not allowed to return it",
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
            { $inc: { availableCopies: 1 } }
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

app.get("/borrows", requireAuth, async (req, res) => {
    try {
        const result = await borrows
            .find({ borrowerEmail: req.auth.email })
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

app.get('/my-books/:email', requireAuth, async (req, res) => {
    if (req.params.email !== req.auth.email) {
        return res.status(403).json({
            success: false,
            message: "You can only view your own books",
            data: null,
        });
    }

    const email = req.auth.email;
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
