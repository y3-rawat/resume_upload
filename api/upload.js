const { MongoClient, Binary } = require('mongodb');

module.exports = async (req, res) => {
    if (req.method === 'POST') {
        const file = req.body.pdf;
        
        // Connect to MongoDB
        const uri = "mongodb+srv://wwwyashrawat542:eYadbhFE21ZtagP4@res.3jx0ak2.mongodb.net/?retryWrites=true&w=majority&appName=res"; // Replace with your MongoDB connection string
        const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
        
        try {
            await client.connect();
            const database = client.db('your_database');
            const collection = database.collection('your_collection');
            
            const pdfData = Buffer.from(file, 'binary');
            const result = await collection.insertOne({
                filename: req.body.pdf.name,
                filetype: req.body.pdf.type,
                filedata: new Binary(pdfData)
            });
            
            res.status(200).json({ success: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to save to database' });
        } finally {
            await client.close();
        }
    } else {
        res.status(405).json({ success: false, message: 'Method not allowed' });
    }
};
