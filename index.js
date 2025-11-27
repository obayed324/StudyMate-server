require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());



const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    const db = client.db('studyMate');
    const partnersCollection = db.collection('allPartner');
    const partnerRequestsCollection = db.collection('partnerRequests');

    // -------------------
    // GET all partners (with optional search and sort)
    app.get('/partners', async (req, res) => {
      const { search, sort } = req.query;
      const query = {};

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { subject: { $regex: search, $options: 'i' } }
        ];
      }

      let cursor = partnersCollection.find(query);

      // Sorting by rating or experience
      if (sort === 'rating') cursor = cursor.sort({ rating: -1 });
      if (sort === 'experience') cursor = cursor.sort({ experienceLevel: 1 });

      const result = await cursor.toArray();
      res.send(result);
    });

    // GET partner by ID
    app.get('/partners/:id', async (req, res) => {
      const { id } = req.params;
      const partner = await partnersCollection.findOne({ _id: new ObjectId(id) });
      if (!partner) return res.status(404).send({ success: false, message: 'Partner not found' });
      res.send({ success: true, partner });
    });

    // POST partner request
    app.post('/partners/:id/request', async (req, res) => {
      const { id } = req.params;
      const { userEmail } = req.body;

      if (!userEmail) return res.status(400).send({ success: false, message: 'User email required' });

      // Increment partnerCount
      const filter = { _id: new ObjectId(id) };
      const update = { $inc: { partnerCount: 1 } };
      const updated = await partnersCollection.updateOne(filter, update);

      // Save request to partnerRequests collection
      const partner = await partnersCollection.findOne(filter);
      const request = {
        partnerId: id,
        partnerName: partner.name,
        partnerEmail: partner.email || null,
        requestedBy: userEmail,
        requestedAt: new Date()
      };
      const insertResult = await partnerRequestsCollection.insertOne(request);

      res.send({ success: true, insertResult, updated });
    });

    console.log("MongoDB connected successfully for partners API");
  } finally {
    // client remains open (pattern)
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('StudyMate Partner API running');
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
