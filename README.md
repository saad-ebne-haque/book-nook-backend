# BookNook Backend

Live backend API: https://book-nook-api-wheat.vercel.app

BookNook is a small online library backend built with Express and MongoDB. Its API supports:

- Listing books, sorting newest books first, and requesting a limited set for a homepage.
- Reading one book or the books added by a particular email address.
- Adding, updating, and deleting books with request validation.
- Borrowing a book, tracking its due date, and updating available copy counts.
- Listing a reader's borrow records and returning borrowed books.
- Deploying the Express app on Vercel or running it locally.

## Run locally

1. Install dependencies with `npm install`.
2. Set `MONGODB_SECRET_URI` to the MongoDB connection string in your environment.
3. Start the server with `npm start` or `node index.js`.
4. Run the API tests with `npm test`.

The backend uses the `book-nook` database, with `books` and `borrows` collections. For Vercel, add `MONGODB_SECRET_URI` to the project's environment variables. The existing frontend can set `NEXT_PUBLIC_API_URL` to this API base URL.

## API routes

| Method | Route | Description |
| --- | --- | --- |
| GET | `/` | Backend health message |
| GET | `/books` | List books; optional `?limit=6` returns the newest first |
| GET | `/books/:id` | Read a book by MongoDB ID |
| GET | `/my-books/:email` | List books added by an email address |
| POST | `/books` | Add a book; the backend records `createdAt` |
| PATCH | `/books/:id` | Update supplied book fields |
| DELETE | `/books/:id` | Delete a book that has no active borrow |
| POST | `/borrows` | Borrow a book; send `bookId` and `userEmail` in JSON |
| GET | `/borrows?email=:email` | List borrow records for an email address |
| DELETE | `/borrows/:id` | Return a borrowed book |

New borrow records include a borrow date and a return date 14 days later. Successful API responses use `{ "success": true, "message": "...", "data": ... }`; errors use the same envelope with `success: false`.

## Example: add a book

```json
{
  "title": "The Little Prince",
  "author": "Antoine de Saint-Exupery",
  "category": "Fiction",
  "description": "A story about friendship and discovery.",
  "cover": "https://example.com/cover.jpg",
  "availableCopies": 2,
  "addedBy": {
    "name": "Reader",
    "email": "reader@example.com"
  }
}
```

This assignment API does not verify Better Auth session tokens. Email fields identify records for compatibility with the current frontend, but are not proof of a user's identity; enforce authentication before using this API for sensitive data.
