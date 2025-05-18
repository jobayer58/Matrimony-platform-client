const express = require('express');
const app = express()
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    const paymentCollection = client.db('Matrimony').collection('payments')
    const userPremiumRequestCollection = client.db('Matrimony').collection('premiumRequest')
    // const ApprovedPremiumUserCollection = client.db('Matrimony').collection('premiumUser')

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
      res.send({ token });
    })

    // middlewares 
    const verifyToken = (req, res, next) => {
      console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userDataCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }


    // user related apis
    // get/show all user data in manage user page
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      console.log(req.headers);
      const result = await userDataCollection.find().toArray()
      res.send(result)
    })

    // get admin user data from the database
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email };
      const user = await userDataCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
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

    // user make admin api
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await userDataCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: 'admin' } }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).send({ message: 'User not found or already admin' });
      }
      res.send(result);

    });


    // user premium request api
    app.post("/premiumRequest", verifyToken, async (req, res) => {
      const userData = req.body;
      console.log(userData.email);
      // check user already existing in premium request collection
      const query = { email: userData.email };
      const user = await userPremiumRequestCollection.findOne(query);
      if (user) {
        return res.send({
          message: " already submit request for premium !",
        });
      }
      const newRequest = await userPremiumRequestCollection.insertOne(
        userData
      );
      res.send(newRequest);
    });

    // // admin get user request for premium api key
    app.get("/premiumRequest", verifyToken, async (req, res) => {
      const query = { status: "pending" };
      const request = await userPremiumRequestCollection.find(query).toArray();
      res.send(request);
    });

    // admin accept request for premium
    app.patch("/premiumRequest", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { status } = req.body;
        const email = req.query?.email;

        if (!email || !status) {
          return res.status(400).send({ message: "Missing email or status" });
        }

        const filter = { email };
        const existing = await userPremiumRequestCollection.findOne(filter);

        if (!existing) {
          return res.status(404).send({ message: "Premium request not found" });
        }

        if (existing.status === status) {
          return res.status(200).send({
            message: `Already ${status}`,
            premiumRequestUpdate: { matchedCount: 1, modifiedCount: 0 },
          });
        }

        const updateStatus = {
          $set: {
            status: status,
          },
        };

        const requestResult = await userPremiumRequestCollection.updateOne(filter, updateStatus);

        if (status === "Approved") {
          const userFilter = { email: email };
          const updateRole = {
            $set: {
              role: "premium",
            },
          };

          const userResult = await userDataCollection.updateOne(userFilter, updateRole);

          return res.send({
            premiumRequestUpdate: requestResult,
            userRoleUpdate: userResult,
          });
        }

        res.send({ premiumRequestUpdate: requestResult });

      } catch (error) {
        console.error("Error in /premiumRequest:", error);
        res.status(500).send({ message: "Server error", error: error.message });
      }
    });

    // get Premium User
    app.get('/premiumUsers', async (req, res) => {
      try {
        const query = { role: 'premium' };
        const premiumUsers = await userDataCollection
          .find(query)
          .limit(6)
          .toArray();
        res.send(premiumUsers);
      } catch (error) {
        res.status(500).send({ message: "Server Error", error: error.message });
      }
    });



    // bioData related api
    // get/show all BioData  data in home page
    app.get('/matchesBio', async (req, res) => {
      const allBioData = await bioDataCollection.find().toArray();
      const bioDataWithSerial = allBioData.map((bio, index) => ({
        ...bio,
        serialNumber: index + 1
      }));

      res.send(bioDataWithSerial);
    });


    app.get('/matchesBio/:id', async (req, res) => {
      const id = req.params.id;
      const allBioData = await bioDataCollection.find().toArray();

      const bioDataWithSerial = allBioData.map((bio, index) => ({
        ...bio,
        serialNumber: index + 1
      }));
      const singleBio = bioDataWithSerial.find(bio => bio._id.toString() === id);

      res.send(singleBio);
    });


    //  get bioData by email
    app.get('/myBioData', verifyToken, async (req, res) => {
      const email = req.query.email;

      const query = { contactEmail: email };
      const result = await bioDataCollection.findOne(query);
      res.send(result);
    });


    // bioData Add and Update
    app.post('/matchesBio', verifyToken, async (req, res) => {
      try {
        const item = req.body;
        const email = item.contactEmail;

        // First check  BioData via email.
        const existingBio = await bioDataCollection.findOne({ contactEmail: email });

        if (existingBio) {
          // if bioData have then update
          const result = await bioDataCollection.updateOne(
            { contactEmail: email },
            { $set: { ...item, updatedAt: new Date() } }
          );
          res.send({
            success: true,
            action: 'updated',
            data: result
          });
        } else {
          // create new bioData
          const result = await bioDataCollection.insertOne({
            ...item,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          res.send({
            success: true,
            action: 'created',
            data: result
          });
        }
      } catch (error) {
        console.error('Error:', error);
        res.status(500).send({
          success: false,
          message: 'Internal server error'
        });
      }
    });



    // favorite BioData Collection

    // get favorite list data from database
    app.get('/favorite', async (req, res) => {
      const email = req.query.email
      const query = { email: email }
      const result = await favoriteBioDataCollection.find(query).toArray()
      res.send(result)
    })

    // send favorite data to database
    app.post('/favorite', async (req, res) => {
      const favoriteItem = req.body;
      const { email, bioId } = favoriteItem;

      const query = { email, bioId };
      const existing = await favoriteBioDataCollection.findOne(query);

      if (existing) {
        return res.send({ message: 'exists' });
      }

      const result = await favoriteBioDataCollection.insertOne(favoriteItem);
      res.send(result);
    });


    // favorite BioData item delete
    app.delete('/favorite/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await favoriteBioDataCollection.deleteOne(query)
      res.send(result)
    })

    //  get data payment for contact user history
    app.get("/payments/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const payments = await paymentCollection.find(query).toArray();
      res.send(payments);
    });


    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount, 'amount inside the intent')

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });

    // payment Post
    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      console.log('payment info', payment);

      res.send(paymentResult);
    })

    // get all pending
    app.get('/admin/pendingContacts', verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollection.find({ status: 'pending' }).toArray();
      res.send(result);
    });

    
    // get user request for contact
    app.get("/contact-request", verifyToken, verifyAdmin, async (req, res) => {
      const query = { status: "pending" };
      const payments = await paymentCollection.find(query).toArray();
      res.send(payments);
    });

    // admin approved contact request
    app.patch("/approved-contact-request", verifyToken, verifyAdmin, async (req, res) => {
      // const { status } = req.body;
      const id = req.query?.id;

      // accept premium user request and update it
      const filter = { _id: new ObjectId(id) };
      const updateStatus = {
        $set: {
          status: "Approved",
        },
      };
      const result = await paymentCollection.updateOne(filter, updateStatus);
      res.send(result);
    }
    );


    // const paymentCollection = client.db('Matrimony').collection('payments')


    // stats or analytics
    app.get('/admin-stats', async (req, res) => {
      const totalBioData = await bioDataCollection.countDocuments();

      const totalMale = await bioDataCollection.countDocuments({
        biodataType: "Male",
      });

      const totalFemale = await bioDataCollection.countDocuments({
        biodataType: "Female",
      });

      // this is not the best way
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce((total, payment) => total + payment.price, 0);

      // const result = await paymentCollection.aggregate([
      //   {
      //     $group: {
      //       _id: null,
      //       totalRevenue: {
      //         $sum: '$price'
      //       }
      //     }
      //   }
      // ]).toArray();

      // const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        totalBioData,
        totalMale,
        totalFemale
      })
    })



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