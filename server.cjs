const express = require("express");
const jsonServer = require("json-server");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = "/g/kopo17/project-runshoes";

app.set("etag", false);

app.use((req, res, next) => {
  if (req.originalUrl.includes("/api/")) {
    res.set("Cache-Control", "no-store");
  }
  next();
});

const router = jsonServer.router(path.join(__dirname, "db.json"));

app.use("/api", jsonServer.defaults(), router);
app.use(`${BASE}/api`, jsonServer.defaults(), router);

app.use(express.static(path.join(__dirname, "dist")));
app.use(BASE, express.static(path.join(__dirname, "dist")));

app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => console.log(`listening on ${PORT}`));