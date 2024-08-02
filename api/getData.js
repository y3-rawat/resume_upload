const { MongoClient } = require('mongodb');
const cors = require('cors');

module.exports = async (req, res) => {
    console.log("Handler started, method:", req.method);

    // Enable CORS
    await new Promise((resolve, reject) => {
        cors()(req, res, (result) => {
            if (result instanceof Error) {
                return reject(result);
            }
            return resolve(result);
        });
    });

    // Handle GET requests
    if (req.method === 'GET') {
        console.log("Received GET request");

        const uri = process.env.MONGODB_URI;
        const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

        try {
            await client.connect();
            console.log("Connected to MongoDB");
            const database = client.db('db');
            const collection = database.collection('items');

            // Fetch data from MongoDB
            const data = await collection.find().toArray();

            console.log("Data fetched from MongoDB", data);
            res.status(200).json({ success: true, data: data });
        } catch (error) {
            console.error("Error fetching data from MongoDB:", error);
            res.status(500).json({ success: false, message: 'Failed to fetch data from database', error: error.message });
        } finally {
            await client.close();
            console.log("MongoDB connection closed");
        }
    } else {
        // Method not allowed for other HTTP methods
        console.log("Method not allowed:", req.method);
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }
};
