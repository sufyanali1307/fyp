const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head><title>Node UI</title></head>
      <body>
        <h1>Node App Working ✅</h1>
        <p>Simple frontend + backend test.</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});