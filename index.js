require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require("firebase-admin");
const serviceAccount = require("./studymateServiceKey.json");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Firebase admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// MongoDB client
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) return res.status(401).send({ message: "Unauthorized access. Token not found" });

  const token = authorization.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.userEmail = decodedToken.email; // attach email to request
    next();
  } catch (error) {
    res.status(401).send({ message: "Unauthorized access!" });
  }
};

// Main function
async function run() {
  try {
    await client.connect();
    const db = client.db('studyMate');
    const partnersCollection = db.collection('allPartner');
    const partnerRequestsCollection = db.collection('partnerRequests');

    console.log("MongoDB connected successfully for partners API");

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

      if (sort === 'rating') cursor = cursor.sort({ rating: -1 });
      if (sort === 'experience') cursor = cursor.sort({ experienceLevel: 1 });

      const result = await cursor.toArray();
      res.send(result);
    });

    // GET partner by ID
    app.get('/partners/:id', async (req, res) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ success: false, message: 'Invalid partner ID' });
      }

      const partner = await partnersCollection.findOne({ _id: new ObjectId(id) });
      if (!partner) return res.status(404).send({ success: false, message: 'Partner not found' });

      res.send({ success: true, partner });
    });

    // POST partner request
    // POST partner request
    app.post('/partners/:id/request', async (req, res) => {
      const { id } = req.params;
      const { userEmail } = req.body;

      if (!userEmail)
        return res.status(400).send({ success: false, message: "User email required" });

      const partner = await partnersCollection.findOne({ _id: new ObjectId(id) });
      if (!partner)
        return res.status(404).send({ success: false, message: "Partner not found" });

      // increase partner count
      await partnersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $inc: { partnerCount: 1 } }
      );

      // save FULL partner data + user email
      const requestData = {
        partnerId: id,
        partnerName: partner.name,
        partnerImage: partner.profileimage,
        subject: partner.subject,
        studyMode: partner.studyMode,
        availabilityTime: partner.availabilityTime,
        location: partner.location,
        experienceLevel: partner.experienceLevel,
        rating: partner.rating,
        partnerCount: partner.partnerCount + 1,
        requestedBy: userEmail,
        requestedAt: new Date()
      };

      const result = await partnerRequestsCollection.insertOne(requestData);

      res.send({ success: true, message: "Request saved", result });
    });


    // POST /partners - Create a new partner profile
    app.post('/partners', verifyToken, async (req, res) => {
      try {
        const partnerData = req.body;

        const requiredFields = [
          'name',
          'profileimage',
          'subject',
          'studyMode',
          'availabilityTime',
          'location',
          'experienceLevel'
        ];

        for (const field of requiredFields) {
          if (!partnerData[field]) {
            return res.status(400).send({ success: false, message: `${field} is required` });
          }
        }

        partnerData.rating = 0;
        partnerData.partnerCount = 0;
        partnerData.email = req.userEmail || partnerData.email || null;
        partnerData.createdAt = new Date();

        const result = await partnersCollection.insertOne(partnerData);

        res.send({
          success: true,
          message: 'Partner profile created successfully',
          partnerId: result.insertedId
        });
      }
      catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: 'Failed to create partner profile' });
      }
    });

    // GET my partner profile
    app.get('/partners/my-profile', verifyToken, async (req, res) => {
      try {
        const email = req.userEmail;
        if (!email) return res.status(400).send({ success: false, message: "Email is required" });

        const partner = await partnersCollection.findOne({ email });
        if (!partner) return res.status(404).send({ success: false, message: "Partner profile not found" });

        res.send({ success: true, partner });
      }
      catch (err) {
        console.error("Error fetching my-profile:", err);
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    app.get('/my-requests', verifyToken, async (req, res) => {
      const email = req.userEmail;
      const requests = await partnerRequestsCollection
        .find({ requestedBy: email })
        .toArray();

      res.send({ success: true, requests });
    });

    app.put('/my-requests/:id', verifyToken, async (req, res) => {
      const { id } = req.params;
      const data = req.body; // data now does NOT include _id

      const result = await partnerRequestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: data }
      );

      // Return updated document
      const updated = await partnerRequestsCollection.findOne({ _id: new ObjectId(id) });

      res.send({ success: true, updated });
    });




    app.delete('/my-requests/:id', verifyToken, async (req, res) => {
      const { id } = req.params;

      const result = await partnerRequestsCollection.deleteOne({
        _id: new ObjectId(id)
      });

      res.send({ success: true, result });
    });


  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

run().catch(console.dir);

// Root route
app.get('/', (req, res) => {
  res.send('StudyMate Partner API running');
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
