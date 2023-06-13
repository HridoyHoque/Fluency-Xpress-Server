const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

console.log(process.env.PAYMENT_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mucefdr.mongodb.net/?retryWrites=true&w=majority`;

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
        await client.connect();

        const classesCollection = client.db('fluencyDb').collection('classes');
        const newClassesCollection = client.db('fluencyDb').collection('newClasses');
        const selectedClassesCollection = client.db('fluencyDb').collection('selectedClasses');
        const instructorsCollection = client.db('fluencyDb').collection('instructors');
        const usersCollection = client.db('fluencyDb').collection('users');
        const paymentCollection = client.db('fluencyDb').collection('payments');

        // get all classes data
        app.get('/classes', async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result);
        });
        // get all instructors information
        app.get('/instructors', async (req, res) => {
            const result = await instructorsCollection.find().toArray();
            res.send(result);
        });
        // get logged users data
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const result = await usersCollection.findOne(query)
            res.send(result);
        })
        // get all users information
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })
        // save users email and role in database
        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const query = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: user,
            }
            const result = await usersCollection.updateOne(query, updateDoc, options)
            res.send(result);
        })
        // make user to admin
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            }
            const result = await usersCollection.updateOne(filter, updateDoc)
            res.send(result);
        })
        // make user to instructor 
        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            }
            const result = await usersCollection.updateOne(filter, updateDoc)
            res.send(result);
        })
        // make newClasses pending to approved 
        app.patch('/newClasses/approved/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'approved'
                },
            }
            const result = await newClassesCollection.updateOne(filter, updateDoc)
            res.send(result);
        })
        // make newClasses pending to denied 
        app.patch('/newClasses/denied/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'denied'
                },
            }
            const result = await newClassesCollection.updateOne(filter, updateDoc)
            res.send(result);
        })

        // get logged instructor classes information
        app.get('/newClasses', async (req, res) => {
            let query = {};
            if (req.query?.email) {
                query = { email: req.query.email }
            }
            const result = await newClassesCollection.find(query).toArray();
            res.send(result);
        })
        // get logged students classes information
        app.get('/selectedClasses', async (req, res) => {
            let query = {};
            if (req.query?.email) {
                query = { email: req.query.email }
            }
            const result = await selectedClassesCollection.find(query).toArray();
            res.send(result);
        })
        //  delete my My selected data
        app.delete("/selectedClasses/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await selectedClassesCollection.deleteOne(query);
            res.send(result);
        })


        // Send feedback to instructor 
        app.patch('/newClasses/feedback/:id', async (req, res) => {
            const id = req.params.id;
            const text = req.body
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    feedback: text
                },
            }
            const result = await newClassesCollection.updateOne(filter, updateDoc)
            res.send(result);
        })

        // get all newClasses
        app.get('/newClasses', async (req, res) => {
            const result = await newClassesCollection.find().toArray();
            res.send(result);
        })

        // store newClasses data to db
        app.post('/newClasses', async (req, res) => {
            const newClass = req.body;
            const result = await newClassesCollection.insertOne(newClass)
            res.send(result);
        })

        //    save selectedClasses data to db
        app.post('/selectedClasses', async (req, res) => {
            const selectedClass = req.body;
            const result = await selectedClassesCollection.insertOne(selectedClass);
            res.send(result);
        });
        // create payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment related api
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const enrolledClassId = payment.classId;
            const result = await paymentCollection.insertOne(payment);


            const filter = { _id: new ObjectId(enrolledClassId) }
            const deleteResult = await selectedClassesCollection.deleteOne(filter)
            res.send({ result, deleteResult });
        })

        // decrease the number of available seats after payment and increase enrolled students number
        app.put('/newClasses/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const item = await newClassesCollection.findOne(filter);
            console.log(item);
            const updateDoc = {
                $inc: { 
                    seats: -1 ,
                    totalEnrolledStudents: +1
                },
            }
            const result = await newClassesCollection.updateOne(filter, updateDoc)
            res.send(result);

        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Teachers are teaching students')
});

app.listen(port, () => {
    console.log(`teacher is training on port ${port}`)
});