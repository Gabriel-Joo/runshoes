const express = require("express");
const jsonServer = require("json-server");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = process.env.BASE_PATH ? process.env.BASE_PATH.replace(/\/$/, "") : "";
const DB = process.env.DB_PATH || path.join(__dirname, "db.json");

app.set("etag", false);

app.use((req, res, next) => {
  if (req.originalUrl.includes("/api/")) {
    res.set("Cache-Control", "no-store");
  }
  next();
});

const router = jsonServer.router(DB);

app.use("/api", jsonServer.defaults(), router);
if (BASE) app.use(`${BASE}/api`, jsonServer.defaults(), router);

app.use(express.static(path.join(__dirname, "dist")));
if (BASE) app.use(BASE, express.static(path.join(__dirname, "dist")));

app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => console.log(`listening on ${PORT}`));