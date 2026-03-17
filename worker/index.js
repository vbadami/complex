const keys = require('./keys');
const redis = require('redis');

async function startWorker() {
  const redisClient = redis.createClient({
    socket: { host: keys.redisHost, port: keys.redisPort }
  });

  redisClient.on('error', (err) => console.log('Redis Client Error', err));

  const sub = redisClient.duplicate();

  function fib(index) {
    if (index < 2) return 1;
    return fib(index - 1) + fib(index - 2);
  }

  try {
    await redisClient.connect();
    await sub.connect();
    console.log('Worker connected to Redis');

    function fib(index) {
      if (index < 2) return 1;
      return fib(index - 1) + fib(index - 2);
    }

    await sub.subscribe('insert', async (message) => {
      console.log('Worker received message:', message);
      const result = fib(parseInt(message));
      await redisClient.hSet('values', message, result.toString());
      console.log(`Calculated fib(${message}) = ${result}`);
    });

    console.log('Worker subscribed to insert channel');
  } catch (err) {
    console.error('Worker start error:', err);
    console.error('Retrying in 5 seconds...');
    setTimeout(startWorker, 5000);
  }
}

startWorker();