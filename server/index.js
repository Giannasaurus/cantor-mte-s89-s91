const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const userRoutes = require('./routes/userRoutes')
const postRoutes = require("./routes/postRoutes")
const dns = require("dns")

require('dotenv').config();

const app = express();

dns.setServers([
    '8.8.8.8',
    '8.8.8.4'
])

mongoose.connect(process.env.MONGODB_STRING);
mongoose.connection.once('open', () => console.log('Now connected to MongoDB Atlas.'))

const corsOptions = {
    origin: ['http://localhost:8000', 'http://localhost:5173'],
    credentials: true,
    optionsSuccessStatus: 200,
}

app.use(cors(corsOptions));
app.use(express.json());

app.use("/users", userRoutes)
app.use("/posts", postRoutes)

if (require.main === module) {
    app.listen(process.env.PORT || 4001, () => {
        console.log(`API is now online on port ${process.env.PORT || 4001}`)
    });
}

module.exports = { app, mongoose };