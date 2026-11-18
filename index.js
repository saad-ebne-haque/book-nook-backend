
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

const authJwks = createRemoteJWKSet(new URL("/api/auth/jwks", betterAuthURL));

app.use(cors());
app.use(express.json());

class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "A valid bearer token is required",
            data: null,
        });
    }

    try {
        const { payload } = await jwtVerify(token, authJwks, {
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

const client = new MongoClient(process.env.MONGODB_SECRET_URI);
await client.connect();
console.log("Connected to MongoDB");

const db = client.db('book-nook');
const books = db.collection('books');
const borrows = db.collection('borrows');
await books.updateMany(
    { availableCopies: { $type: "string" } },
    [{ $set: { availableCopies: { $toInt: "$availableCopies" } } }]
);

// Runs every step inside one MongoDB transaction so either all changes commit or none do.
async function runInTransaction(operation) {
    const session = await client.startSession();
    try {
        await session.withTransaction(operation);
    } finally {
        await session.endSession();
    }
}

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
    if (req.query.search !== undefined && typeof req.query.search !== "string") {
        return res.status(400).json({
            success: false,
            message: "Search must be a single text value",
            data: null,
        });
    }

    const search = (req.query.search ?? "").trim();
    if (search.length > 100) {
        return res.status(400).json({
            success: false,
            message: "Search must be 100 characters or fewer",
            data: null,
        });
    }

    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = search
        ? {
            $or: [
                { title: { $regex: safeSearch, $options: "i" } },
                { author: { $regex: safeSearch, $options: "i" } },
                { category: { $regex: safeSearch, $options: "i" } },
            ],
        }
        : {};

    const requestedSort = req.query.sort ?? "newest";
    if (typeof requestedSort !== "string") {
        return res.status(400).json({
            success: false,
            message: "Sort must be a single text value",
            data: null,
        });
    }

    const sortOptions = {
        newest: { createdAt: -1, _id: -1 },
        oldest: { createdAt: 1, _id: 1 },
        title: { title: 1, _id: 1 },
    };
    if (!Object.prototype.hasOwnProperty.call(sortOptions, requestedSort)) {
        return res.status(400).json({
            success: false,
            message: "Sort must be newest, oldest, or title",
            data: null,
        });
    }

    const pageValue = req.query.page;
    const limitValue = req.query.limit;
    if ((pageValue !== undefined && typeof pageValue !== "string")
        || (limitValue !== undefined && typeof limitValue !== "string")) {
        return res.status(400).json({
            success: false,
            message: "Page and limit must be single number values",
            data: null,
        });
    }

    const page = pageValue === undefined ? undefined : Number(pageValue);
    const limit = limitValue === undefined ? undefined : Number(limitValue);
    if (page !== undefined && (!Number.isSafeInteger(page) || page < 1)) {
        return res.status(400).json({
            success: false,
            message: "Page must be a positive integer",
            data: null,
        });
    }
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)) {
        return res.status(400).json({
            success: false,
            message: "Limit must be an integer between 1 and 100",
            data: null,
        });
    }

    const cursor = books.find(filter).sort(sortOptions[requestedSort]);
    if (page !== undefined) {
        const pageSize = limit ?? 9;
        const totalBooks = await books.countDocuments(filter);
        const totalPages = Math.ceil(totalBooks / pageSize);
        const currentPage = totalPages === 0 ? 1 : Math.min(page, totalPages);
        const pageBooks = await cursor
            .skip((currentPage - 1) * pageSize)
            .limit(pageSize)
            .toArray();

        return res.status(200).json({
            success: true,
            message: "Books retrieved successfully",
            data: pageBooks,
            pagination: {
                currentPage,
                pageSize,
                totalBooks,
                totalPages,
            },
        });
    }

    if (limit !== undefined) {
        cursor.limit(limit);
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
    if (!ObjectId.isValid(id)) {
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
    if (!newBook || typeof newBook !== "object" || Array.isArray(newBook)) {
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
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({
            success: false,
            message: "Invalid book ID",
            data: null,
        });
    }

    if (!updatedBook || typeof updatedBook !== "object" || Array.isArray(updatedBook)) {
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
    if (!ObjectId.isValid(id)) {
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

        if (!borrowedBook || typeof borrowedBook !== "object" || Array.isArray(borrowedBook)) {
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
        let insertResult = null;

        await runInTransaction(async (transactionSession) => {
            const book = await books.findOne(
                { _id: bookObjectId },
                { session: transactionSession }
            );
            if (!book) {
                throw new ApiError(404, "Book not found");
            }

            const alreadyBorrowed = await borrows.findOne({
                bookId: borrowedBook.bookId,
                borrowerEmail: req.auth.email,
            }, { session: transactionSession });
            if (alreadyBorrowed) {
                throw new ApiError(409, "You have already borrowed this book");
            }

            const updateBook = await books.updateOne(
                {
                    _id: bookObjectId,
                    availableCopies: { $gt: 0 },
                },
                { $inc: { availableCopies: -1 } },
                { session: transactionSession }
            );
            if (updateBook.modifiedCount === 0) {
                throw new ApiError(409, "Book not found or unavailable");
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
            insertResult = await borrows.insertOne(
                borrowRecord,
                { session: transactionSession }
            );
        });

        return res.status(201).json({
            success: true,
            message: "Book borrowed successfully",
            data: insertResult,
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return res.status(err.status).json({
                success: false,
                message: err.message,
                data: null,
            });
        }

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
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid borrow ID",
                data: null,
            });
        }

        const borrowObjectId = new ObjectId(id);
        let updateBook = null;
        let result = null;

        await runInTransaction(async (transactionSession) => {
            const borrow = await borrows.findOne({
                _id: borrowObjectId,
                borrowerEmail: req.auth.email,
            }, { session: transactionSession });
            if (!borrow) {
                throw new ApiError(404, "Borrow record not found or you are not allowed to return it");
            }

            updateBook = await books.updateOne(
                { _id: new ObjectId(borrow.bookId) },
                { $inc: { availableCopies: 1 } },
                { session: transactionSession }
            );
            if (updateBook.matchedCount === 0) {
                throw new ApiError(404, "Book not found");
            }

            result = await borrows.deleteOne(
                { _id: borrowObjectId },
                { session: transactionSession }
            );
            if (result.deletedCount === 0) {
                throw new ApiError(404, "Borrow record not found");
            }
        });

        return res.status(200).json({
            success: true,
            message: "Book returned successfully",
            data: {
                updateBook,
                result,
            },
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return res.status(err.status).json({
                success: false,
                message: err.message,
                data: null,
            });
        }

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
