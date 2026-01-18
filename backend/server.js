const express = require('express');
const app = express();
const port = 5000;

app.get('/', (req, res) => {
  res.json({ message: "Hello from the DevOps GitOps Pipeline!", timestamp: new Date() });
});

app.listen(port, () => {
  console.log(`Backend API listening at http://localhost:${port}`);
});
