const express = require("express");
const jsonServer = require("json-server");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = "/g/kopo17/project-runshoes";

app.use(`${BASE}/api`, jsonServer.defaults(), jsonServer.router("db.json"));
app.use(BASE, express.static(path.join(__dirname, "dist")));

app.get(`${BASE}/*splat`, (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => console.log(`listening on ${PORT}`));
