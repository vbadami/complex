const keys = require('./keys');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pgClient = new Pool({
  user: keys.pgUser,
  host: keys.pgHost,
  database: keys.pgDatabase,
  password: keys.pgPassword,
  port: keys.pgPort
});
pgClient.on('error', () => console.log('Lost PG connection'));

const redisClient = redis.createClient({ socket: { host: keys.redisHost, port: keys.redisPort } });
redisClient.on('error', (err) => console.log('Redis Client Error', err));

let redisPublisher;
let isStarting = false;

const start = async () => {
  if (isStarting) return;
  isStarting = true;

  try {
    // Connect redis client if not already connected
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log('Redis connected');
    }

    // Create publisher if not already created
    if (!redisPublisher) {
      redisPublisher = redisClient.duplicate();
      await redisPublisher.connect();
      console.log('Redis publisher connected');
    }

    // Create table before setting up routes
    await pgClient.query('CREATE TABLE IF NOT EXISTS values (number INTEGER)');
    console.log('Table created or already exists');

    app.get('/', (req, res) => {
      res.send('Hi');
    });

    app.get('/values/all', async (req, res) => {
      const values = await pgClient.query('SELECT * from values');
      res.send(values.rows);
    });

    app.get('/values/current', async (req, res) => {
      const values = await redisClient.hGetAll('values');
      res.send(values);
    });

    app.post('/values', async (req, res) => {
      const index = req.body.index;

      if (parseInt(index) > 40) {
        return res.status(422).send('Index too high');
      }

      await redisClient.hSet('values', index, 'Nothing yet!');
      await redisPublisher.publish('insert', String(index));
      pgClient.query('INSERT INTO values(number) VALUES($1)', [index]);

      res.send({ working: true });
    });

    app.listen(5000, () => {
      console.log('Listening on port 5000');
    });
  } catch (err) {
    console.error('Server start error:', err);
    isStarting = false;
    console.error('Retrying in 5 seconds...');
    setTimeout(start, 5000);
  }
};

start();