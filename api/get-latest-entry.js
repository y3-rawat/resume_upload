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

    if (req.method === 'GET') {
        console.log("Received GET request");

        const uri = process.env.MONGODB_URI;
        console.log("Attempting to connect to MongoDB...");
        const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

        try {
            await client.connect();
            console.log("Connected to MongoDB");
            const database = client.db('db');
            const collection = database.collection('items');

            // Fetch the latest document
            const latestEntry = await collection.find().sort({ _id: -1 }).limit(1).next();

            if (latestEntry) {
                res.status(200).json({ success: true, extractedText: latestEntry.extractedText, formData: latestEntry.formData });
            } else {
                res.status(404).json({ success: false, message: 'No data found' });
            }
        } catch (error) {
            console.error("Error fetching data from MongoDB:", error);
            res.status(500).json({ success: false, message: 'Failed to fetch data', error: error.message });
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
