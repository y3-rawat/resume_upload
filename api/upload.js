const { MongoClient, Binary } = require('mongodb');
const Busboy = require('busboy');
console.log("start-astas")
module.exports = async (req, res) => {
    console.log("start")
    if (req.method === 'POST') {
        console.log("Received POST request");

        const busboy = new Busboy({ headers: req.headers });
        let fileBuffer = null;
        let fileName = '';
        let fileType = '';

        busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
            console.log(`Uploading: ${filename}`);
            fileName = filename;
            fileType = mimetype;
            file.on('data', (data) => {
                if (fileBuffer) {
                    fileBuffer = Buffer.concat([fileBuffer, data]);
                } else {
                    fileBuffer = data;
                }
            });
        });

        busboy.on('finish', async () => {
            if (!fileBuffer) {
                console.error("No file received");
                return res.status(400).json({ success: false, message: 'No file uploaded' });
            }

            const uri = "mongodb+srv://wwwyashrawat542:eYadbhFE21ZtagP4@res.3jx0ak2.mongodb.net/?retryWrites=true&w=majority&appName=res"; // Replace with your MongoDB connection string
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
                console.error("Error ");

            }
        });

        req.pipe(busboy);
    } else {
        res.status(405).json({ success: false, message: 'Method not allowed' });
    }
};
