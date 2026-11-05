import express from 'express';
import cors from 'cors';
import 'dotenv/config';


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());






app.get('/', (req, res) => {
    res.send({ success: true, message: 'Book Nook backend server connected' });
});




if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`this server is running on PORT: ${PORT}`);
    });
}

export default app;