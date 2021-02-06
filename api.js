const express = require("express");
const app = express();
const port = 4000;
const index = require("./index");

// Used by Heroku to scape Skyscanner as defined by chron job interval
app.get("/scrapeSkyscanner", async (req, res, next) => {
  try {
    res.setHeader("Content-Type", "application/json"); // Set to JSON else res will be text/html by default, which makes viewing response messy
    const scrappedListingDataObj = await index.main();
    res.send(scrappedListingDataObj);
  } catch (error) {
    console.log("GET error");
    console.log(error);
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
