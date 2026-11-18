# BookNook Backend API

The BookNook backend is an Express API backed by MongoDB. It serves the shared book collection and handles authenticated book management and borrowing.

**Live API:** [https://book-nook-backend-api.vercel.app/](https://book-nook-backend-api.vercel.app/)

## Features

- List, search, sort, paginate, and retrieve books.
- Create, update, and delete books with ownership checks.
- Verify Better Auth JWTs using the frontend JWKS endpoint.
- Borrow and return books while maintaining available-copy counts.
- Prevent duplicate active borrows and reject unavailable copies.
- Use MongoDB transactions for borrow, return, and inventory updates.
- Run authentication, ownership, borrow, and return tests against an isolated MongoDB replica set.

## Tech stack

- Node.js and Express
- MongoDB Node.js driver
- JOSE for JWT/JWKS verification
- `mongodb-memory-server` for API tests

## API routes

Protected routes require an `Authorization: Bearer <token>` header. Tokens are issued by the BookNook frontend's Better Auth service.

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/` | Public | API health check |
| `GET` | `/books` | Public | List books; supports `search`, `sort`, `page`, and `limit` |
| `GET` | `/books/:id` | Authenticated | Retrieve one book |
| `POST` | `/books` | Authenticated | Add a book for the signed-in user |
| `PATCH` | `/books/:id` | Authenticated owner | Update editable book fields and copy inventory |
| `DELETE` | `/books/:id` | Authenticated owner | Delete a book |
| `POST` | `/borrows` | Authenticated | Borrow a book using `bookId` and `returnDate` |
| `GET` | `/borrows` | Authenticated | List the signed-in user's active borrows |
| `DELETE` | `/borrows/:id` | Authenticated borrower | Return a borrowed book |
| `GET` | `/my-books/:email` | Authenticated owner | List books added by the signed-in user |

Responses use a JSON envelope with `success`, `message`, and `data` fields.

## Local development

Requirements: Node.js and a MongoDB deployment that supports transactions (a replica set, such as MongoDB Atlas).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in this directory:

   ```dotenv
   MONGODB_SECRET_URI=<your-mongodb-connection-string>
   BETTER_AUTH_URL=http://localhost:3000
   PORT=5000
   ```

   `BETTER_AUTH_URL` must be the frontend origin hosting Better Auth, because the API loads signing keys from `<BETTER_AUTH_URL>/api/auth/jwks`. In production, set it to `https://book-nook-lime.vercel.app`. Keep credentials out of source control.

3. Start the API:

   ```bash
   npm start
   ```

   The local API listens on port `5000` by default. `PORT` can override it.

## Tests

The test suite starts an isolated MongoDB replica set and a local JWKS server; it does not use the configured production database.

```bash
npm test
```

## Related project

- **Frontend website:** [https://book-nook-lime.vercel.app/](https://book-nook-lime.vercel.app/)
