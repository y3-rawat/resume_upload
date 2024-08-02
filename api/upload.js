const { MongoClient, Binary } = require('mongodb');
const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

module.exports = async (req, res) => {
    console.log("Handler started");
    await new Promise((resolve, reject) => {
        cors()(req, res, (result) => {
            if (result instanceof Error) {
                return reject(result);
            }
            return resolve(result);
        });
    });
    
    // Serve the HTML file for GET requests
    if (req.method === 'GET') {
        const htmlPath = path.join(__dirname, '..', 'index.html');
        try {
            const content = await fs.promises.readFile(htmlPath, 'utf8');
            res.setHeader('Content-Type', 'text/html');
            return res.send(content);
        } catch (err) {
            console.error("Error reading HTML file:", err);
            return res.status(500).send('Error loading page');
        }
    }

    // Handle POST requests for file upload
    if (req.method === 'POST') {
        console.log("Received POST request");

        return new Promise((resolve, reject) => {
            const busboy = Busboy({ headers: req.headers });
            let fileBuffer = null;
            let fileName = '';
            let fileType = '';

            busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
                console.log(`Uploading: ${filename}`);
                fileName = filename;
                fileType = mimetype;
                const chunks = [];
                file.on('data', (data) => {
                    chunks.push(data);
                });
                file.on('end', () => {
                    fileBuffer = Buffer.concat(chunks);
                });
            });

            busboy.on('finish', async () => {
                if (!fileBuffer) {
                    console.error("No file received");
                    res.status(400).json({ success: false, message: 'No file uploaded' });
                    return resolve();
                }

                const uri = process.env.MONGODB_URI;
                const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

                try {
                    await client.connect();
                    console.log("Connected to MongoDB");
                    const database = client.db('db');
                    const collection = database.collection('items');

                    const result = await collection.insertOne({
                        filename: fileName,
                        filetype: fileType,
                        filedata: new Binary(fileBuffer)
                    });

                    console.log("File successfully uploaded to MongoDB");
                    res.status(200).json({ success: true });
                } catch (error) {
                    console.error("Error uploading file to MongoDB:", error);
                    res.status(500).json({ success: false, message: 'Failed to save to database' });
                } finally {
                    await client.close();
                    resolve();
                }
            });

            busboy.on('error', (error) => {
                console.error("Busboy error:", error);
                res.status(500).json({ success: false, message: 'File processing error' });
                resolve();
            });

            req.pipe(busboy);
        });
    }

    // Method not allowed for other HTTP methods
    return res.status(405).json({ success: false, message: 'Method not allowed' });
};