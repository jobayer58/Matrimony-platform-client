const express = require('express');
const app = express()
const cors = require('cors');
require('dotenv').config()
const port = process.env.PORT || 5000

// middleware
app.use(cors())
app.use(express.json())


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.esqhd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();


    // matrimony related api data collection name
    const bioDataCollection = client.db('Matrimony').collection('biodatas')
    const userDataCollection = client.db('Matrimony').collection('users')
    const favoriteBioDataCollection = client.db('Matrimony').collection('favoriteBioData')

    // user related apis
    // get/show all user data in manage user page
    app.get('/users', async (req, res) => {
      const result = await userDataCollection.find().toArray()
      res.send(result)
    })

    // send user data to database(create/add)
    app.post('/users', async (req, res) => {
      const user = req.body
      // insert email if user doesn't exists
      const query = { email: user.email }
      const existingUser = await userDataCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userDataCollection.insertOne(user)
      res.send(result)
    })

    // get/show all BioData  data in home page
    app.get('/matchesBio', async (req, res) => {
      const result = await bioDataCollection.find().toArray()
      res.send(result)
    })

    // bioData Details
    app.get('/matchesBio/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await bioDataCollection.findOne(query)
      res.send(result)
    })

    // favorite BioData Collection
    app.post('/favorite', async (req, res) => {
      const favoriteItem = req.body;
      const result = await favoriteBioDataCollection.insertOne(favoriteItem);
      res.send(result);
    });


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('matrimony is sitting')
})

app.listen(port, () => {
  console.log(`matrimony platform is sitting on port ${port}`);
})