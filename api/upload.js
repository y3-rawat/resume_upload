const { MongoClient, Binary } = require('mongodb');
const Busboy = require('busboy');
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

    // Handle POST requests for file upload
    if (req.method === 'POST') {
        console.log("Received POST request");

        return new Promise((resolve, reject) => {
            const busboy = Busboy({ headers: req.headers });
            let fileBuffer = null;
            let fileName = '';
            let fileType = '';

            busboy.on('file', (fieldname, file, { filename, mimeType }) => {
                console.log(`Uploading: ${filename}, MIME type: ${mimeType}`);
                fileName = filename;
                fileType = mimeType;
                const chunks = [];
                file.on('data', (data) => {
                    chunks.push(data);
                });
                file.on('end', () => {
                    fileBuffer = Buffer.concat(chunks);
                    console.log(`File upload complete. Size: ${fileBuffer.length} bytes`);
                });
            });

            busboy.on('finish', async () => {
                if (!fileBuffer) {
                    console.error("No file received");
                    res.status(400).json({ success: false, message: 'No file uploaded' });
                    return resolve();
                }

                const uri = process.env.MONGODB_URI;
                console.log("Attempting to connect to MongoDB...");
                const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

                try {
                    await client.connect();
                    console.log("Connected to MongoDB");
                    const database = client.db('db');
                    const collection = database.collection('items');

                    console.log("Inserting document into MongoDB...");
                    const result = await collection.insertOne({
                        filename: fileName,
                        filetype: fileType,
                        filedata: new Binary(fileBuffer)
                    });

                    console.log("File successfully uploaded to MongoDB", result);
                    res.status(200).json({ success: true });
                } catch (error) {
                    console.error("Error uploading file to MongoDB:", error);
                    res.status(500).json({ success: false, message: 'Failed to save to database', error: error.message });
                } finally {
                    await client.close();
                    console.log("MongoDB connection closed");
                    resolve();
                }
            });

            busboy.on('error', (error) => {
                console.error("Busboy error:", error);
                res.status(500).json({ success: false, message: 'File processing error', error: error.message });
                resolve();
            });

            req.pipe(busboy);
        });
    } else {
        // Method not allowed for other HTTP methods
        console.log("Method not allowed:", req.method);
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }
};