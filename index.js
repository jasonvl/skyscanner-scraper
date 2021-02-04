const request = require("request-promise");
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
var robotsParser = require("robots-parser"); // To adhire to robots.txt rules for given site
const mongoose = require("mongoose"); // Driver to connect to MongoDB
const fs = require("fs");
var express = require("express");

const credentials = require("./credentials/credentials");
const flightSearchParams = require("./searchFieldParams");
const Listing = require("./model/ListingSchema"); // Import our schema
const baseUrl = "https://www.skyscanner.com/";
const testUrl =
  "https://www.skyscanner.com/transport/flights/bos/cun/210301/210331/?adults=1&adultsv2=1&cabinclass=economy&children=0&childrenv2=&destinationentityid=27540602&inboundaltsenabled=false&infants=0&originentityid=27539525&outboundaltsenabled=false&preferdirects=false&preferflexible=false&ref=home&rtn=1";
const mongoDbUrl = require("./config/mongoConfig"); // MongoDB connection URL

let browser;

var app = express();

async function getRobotsTxt() {
  try {
    const robotsURL = "https://www.skyscanner.com/robots.txt";
    const robotTxtRules = await request.get(robotsURL); // Make req to GET robots text file
    const robots = robotsParser(robotsURL, robotTxtRules); // Pass URL and ruleset to parser

    if (!robots.isAllowed(baseUrl, "myBot")) {
      return false;
    }

    return true;
  } catch (error) {
    console.log(error);
  }
}

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    mongoose.connect(mongoDbUrl, {
      useNewUrlParser: true,
      useCreateIndex: true,
      useUnifiedTopology: true,
    });
    const connection = mongoose.connection;
    connection.once("open", () => {
      console.log("MongoDB database connection established successfully");
    });
  } catch (error) {
    console.log("Connecting to MongoDB failed");
    console.log(error);
  }
}

async function signIn(page, email, password) {
  try {
    await page.click("#login-button-nav-item button"); // Click on login button
    await page.waitFor(1000);
    await page.click('[data-testid="login-email-button"]'); // Click on email option
    await page.waitFor(1000);
    await page.type(".js-accountDetectionEmailInput", email);
    await page.click(".js-progressionButton");
  } catch (error) {
    console.log("Login failed.");
    console.log(error);
  }
}

// Helper funtion to choose a date from the calendar.
async function pickCalendarDate(page, option, day, month, year) {
  try {
    // await page.click('[class*="FlightDatepicker"] li:nth-of-type(1) button'); // Make sure "Specific Date" option is choosen
    if (option === "depart") {
      await page.click("#depart-calendar__bpk_calendar_nav_select");
    }

    if (option === "return") {
      await page.click("#return-calendar__bpk_calendar_nav_select");
    }

    var month = month || new Date().getMonth().toString().padStart(2, "0");
    var year = year || new Date().getFullYear();

    // Select MM YYYY from drop-down
    await page.select('select[name="months"]', `${year}-${month}`); // Note: Value is of format YYYY-MM
    // await page.select(
    //   "#depart-calendar__bpk_calendar_nav_select",
    //   `${year}-${month}`
    // ); // Note: Value is of format YYYY-MM

    // Iterate through list of days in calander and select the day we want
    await page.evaluate((day) => {
      document
        .querySelectorAll(
          '[class*="BpkCalendarDate_bpk-calendar-date"]:not([class*="BpkCalendarDate_bpk-calendar-date--outside"])'
        )
        [parseInt(day) - 1].click();
    }, day);
  } catch (error) {
    console.log("Calandar operation failed.");
    console.log(error);
  }
}

async function completeSearchField(page, flightSearchParams) {
  try {
    // Enter source airport
    await page.click("#fsc-origin-search");
    await page.type("#fsc-origin-search", flightSearchParams.from, {
      delay: 0,
    });

    // Enter destination airport
    await page.click("#fsc-destination-search");
    await page.type("#fsc-destination-search", flightSearchParams.to, {
      delay: 0,
    });

    // Enter departure date
    await page.click("#depart-fsc-datepicker-button");
    await pickCalendarDate(
      page,
      "depart",
      flightSearchParams.departDay,
      flightSearchParams.departMonth,
      flightSearchParams.departYear
    );

    // Enter return date if roundtrip
    if (flightSearchParams.oneWay === true) {
      await page.click("#fsc-trip-type-selector-one-way");
    } else {
      await page.click("#return-fsc-datepicker-button");
      await pickCalendarDate(
        page,
        "return",
        flightSearchParams.returnDay,
        flightSearchParams.returnMonth,
        flightSearchParams.returnYear
      );
    }

    // Choose cabin class and number of travelers
    if (checkStringInput(flightSearchParams.cabinClass)) {
      await page.click('[name="class-travellers-trigger"]');
      await page.click('[name="search-controls-cabin-class-dropdown"]');

      await page.select(
        '[name="search-controls-cabin-class-dropdown"]',
        flightSearchParams.cabinClass
      );
    }

    // Choose number of adults
    if (checkStringInput(flightSearchParams.numOfAdults)) {
      adults = parseInt(flightSearchParams.numOfAdults);

      await page.click('[name="class-travellers-trigger"]');

      if (adults > 0) {
        for (var i = 0; i < adults - 1; i++) {
          await page.click('[title="Increase number of adults"]'); // Default 1
        }
      }
    }

    if (checkStringInput(flightSearchParams.numOfChildren)) {
      children = parseInt(flightSearchParams.numOfChildren);

      await page.click('[name="class-travellers-trigger"]');

      if (children > 0) {
        for (var i = 0; i < children - 1; i++) {
          await page.click('[title="Increase number of children"]'); // Default 0
        }
      }
    }

    await page.click('[class*="BpkPopover_bpk-popover__footer"] button'); // Submit search params
  } catch (error) {
    console.log("Search field submission failed.");
    console.log(error);
  }
}

// jvl
async function scrapeListingInfo(page, listingURLs) {
  try {
    // For each listing, visit it's URL
    // Note: We're using old for-loop instead of listings.forEach because forEach does things parallel, which Puppeteer doesn't like
    for (var i = 0; i < listingURLs.length; i++) {
      await page.goto(listingURLs[i], { waitUntil: "networkidle2" });

      const html = await page.content();
      const $ = await cheerio.load(html);

      // If listing is still available - required because listing might be sold out
      if (
        $("div[class^='UnavailableItinerary_unavailableContainer']").length ===
        0
      ) {
        // Schema for scrapped flight info
        // const listingSchema = new Schema({
        //   bookingURL: String,
        //   flexibleTicket: Boolean,
        //   outboundAirline: String,
        //   returnAirline: String,
        //   ticketPrice: String,
        //   outboundDirectFlight: Boolean,
        //   outboundDate: String,
        //   outboundTripDuration: String,
        //   outboundStartTime: String,
        //   outboundEndTime: String,
        //   returnDirectFlight: Boolean,
        //   returnDate: String,
        //   returnStartTime: String,
        //   returnEndTime: String,
        //   returnTripDuration: String,
        // });

        const bookingURL = listingURLs[i];
        console.log(bookingURL);

        var flexibleTicket = false;
        if (
          $(
            "#app-root > div > div.DetailsPanelContent_content__El2wi > div > div.FareFamilies_container__3xfSy > div.FareFamilies_pricesContainer__2HHQR > div > div.PricingItem_providerFeatures__1uhxu > div > span"
          ).text() == "Flexible ticket"
        ) {
          flexibleTicket = true;
        }
        listingURLs[i].flexibleTicket = flexibleTicket;
        console.log(flexibleTicket);

        const outboundAirline = $(
          "#app-root > div > div.DetailsPanelContent_content__El2wi > div.DetailsPanelContent_item__2U8Uo.DetailsPanelContent_left__1ietC > div.DetailsPanelContent_covidContainer__3c8mU > table > tbody > tr:nth-child(1) > th:nth-child(2)"
        ).text();
        listingURLs[i].outboundAirline = outboundAirline;

        // If return airline is differnt than outbound airline
        var returnAirline = outboundAirline;
        if (
          $(
            "#app-root > div > div.DetailsPanelContent_content__El2wi > div.DetailsPanelContent_item__2U8Uo.DetailsPanelContent_left__1ietC > div.DetailsPanelContent_covidContainer__3c8mU > table > tbody > tr:nth-child(1) > th:nth-child(3)"
          ).length > 0
        ) {
          returnAirline = $(
            "#app-root > div > div.DetailsPanelContent_content__El2wi > div.DetailsPanelContent_item__2U8Uo.DetailsPanelContent_left__1ietC > div.DetailsPanelContent_covidContainer__3c8mU > table > tbody > tr:nth-child(1) > th:nth-child(3)"
          ).text();
        }
        listingURLs[i].returnAirline = returnAirline;

        var ticketPrice = $(
          "#app-root > div > div.DetailsPanelContent_content__El2wi > div > div.FareFamilies_container__3xfSy > div:nth-child(2) > div > div > div > div.slick-slide.slick-active.slick-current > div > div > div.FareCard_cardFooterConfig__3bLgG > div:nth-child(2) > span > span > span"
        ).text();
        // If ticket price is displayed in another format
        if (ticketPrice == "") {
          ticketPrice = $(
            "#app-root > div > div.DetailsPanelContent_content__El2wi > div.DetailsPanelContent_item__2U8Uo.DetailsPanelContent_left__1ietC > div.PricingItem_container__1naeH > div.PricingItem_agentRow__3kCL_ > div.PricingItem_ctaSection__1YlaP > div > div.TotalPrice_totalPriceContainer__3bOWO > span.BpkText_bpk-text__2VouB.BpkText_bpk-text--lg__1PdnC.BpkText_bpk-text--bold__NhE9P"
          ).text();
        }
        listingURLs[i].ticketPrice = ticketPrice;

        var outboundDirectFlight = false;
        if (
          $(
            "#app-root > div > div.DetailsPanelContent_content__El2wi > div > div:nth-child(1) > button > div.LegSummary_detailsContainer__BAkI8 > div > div.LegInfo_legInfo__2UyXp > div.LegInfo_stopsContainer__2Larg > div.LegInfo_stopsLabelContainer__1S6VX > span"
          ).text() === "Non-stop"
        ) {
          outboundDirectFlight = true;
        }
        listingURLs[i].outboundDirectFlight = outboundDirectFlight;

        const outboundDate = $(
          "#app-root > div > div.DetailsPanelContent_content__El2wi > div > div:nth-child(1) > div.LegHeader_container__3jKJM > div > h4.BpkText_bpk-text__2VouB.BpkText_bpk-text--base__3REoZ.LegHeader_legDate__1uPxp"
        ).text();
        listingURLs[i].outboundDate = outboundDate;

        const outboundTripDuration = $(
          "#app-root > div > div.DetailsPanelContent_content__El2wi > div > div:nth-child(1) > button > div.LegSummary_detailsContainer__BAkI8 > div > div.LegInfo_legInfo__2UyXp > div.LegInfo_stopsContainer__2Larg > span"
        ).text();
        listingURLs[i].outboundTripDuration = outboundTripDuration;

        const outboundStartTime = $(
          "#app-root > div > div.DetailsPanelContent_content__El2wi > div > div:nth-child(1) > button > div.LegSummary_detailsContainer__BAkI8 > div > div.LegInfo_legInfo__2UyXp > div.LegInfo_routePartialDepart__Ix_Rt > span.BpkText_bpk-text__2VouB.BpkText_bpk-text--lg__1PdnC.LegInfo_routePartialTime__ngmkT > div > span"
        ).text();
        listingURLs[i].outboundStartTime = outboundStartTime;

        const outboundEndTime = $(
          "#app-root > div > div.DetailsPanelContent_content__El2wi > div > div:nth-child(1) > button > div.LegSummary_detailsContainer__BAkI8 > div > div.LegInfo_legInfo__2UyXp > div.LegInfo_routePartialArrive__1fHVy > span.BpkText_bpk-text__2VouB.BpkText_bpk-text--lg__1PdnC.LegInfo_routePartialTime__ngmkT > div > span"
        ).text();
        listingURLs[i].outboundEndTime = outboundEndTime;

        var returnDirectFlight = false;
        if (
          $(
            "#app-root > div > div.DetailsPanelContent_content__El2wi > div > div:nth-child(2) > button > div.LegSummary_detailsContainer__BAkI8 > div > div.LegInfo_legInfo__2UyXp > div.LegInfo_stopsContainer__2Larg > div.LegInfo_stopsLabelContainer__1S6VX > span"
          ).text() == "Non-stop"
        ) {
          returnDirectFlight = true;
        }
        listingURLs[i].returnDirectFlight = returnDirectFlight;

        const returnDate = $(
          "#app-root > div > div.DetailsPanelContent_content__El2wi > div > div:nth-child(2) > div.LegHeader_container__3jKJM > div > h4.BpkText_bpk-text__2VouB.BpkText_bpk-text--base__3REoZ.LegHeader_legDate__1uPxp"
        ).text();
        listingURLs[i].returnDate = returnDate;

        const returnStartTime = $(
          "#app-root > div > div.DetailsPanelContent_content__El2wi > div > div:nth-child(2) > button > div.LegSummary_detailsContainer__BAkI8 > div > div.LegInfo_legInfo__2UyXp > div.LegInfo_routePartialDepart__Ix_Rt > span.BpkText_bpk-text__2VouB.BpkText_bpk-text--lg__1PdnC.LegInfo_routePartialTime__ngmkT > div > span"
        ).text();
        listingURLs[i].returnStartTime = returnStartTime;

        const returnEndTime = $(
          "#app-root > div > div.DetailsPanelContent_content__El2wi > div > div:nth-child(2) > button > div.LegSummary_detailsContainer__BAkI8 > div > div.LegInfo_legInfo__2UyXp > div.LegInfo_routePartialArrive__1fHVy > span.BpkText_bpk-text__2VouB.BpkText_bpk-text--lg__1PdnC.LegInfo_routePartialTime__ngmkT > div > span"
        ).text();
        listingURLs[i].returnEndTime = returnEndTime;

        const returnTripDuration = $(
          "#app-root > div > div.DetailsPanelContent_content__El2wi > div > div:nth-child(2) > button > div.LegSummary_detailsContainer__BAkI8 > div > div.LegInfo_legInfo__2UyXp > div.LegInfo_stopsContainer__2Larg > span"
        ).text();
        listingURLs[i].returnTripDuration = returnTripDuration;

        const listingModel = new Listing(listings[i]); // Create new listing model
        await listingModel.save(); // Save model to Mongodb

        console.log(listingURLs[i]);
      } else {
        console.log(`${listingURLs[i]} no longer available`);
      }
    }
  } catch (error) {
    console.log("Scrape flight data failed.");
    console.log(error);
  }
}
function checkStringInput(string) {
  return !(!string || string == undefined || string == "");
}

/*
Helper method used by scrapeListingForUrlInfinteScrollItems() to get the list of listings in the DON.
*/
function extractItems() {
  // Get the number of listings in the DOM and turn it into an array
  const extractedItems = Array.from(
    document.querySelectorAll("div[class^='FlightsResults_dayViewItems'] > div")
  );

  const items = extractedItems.map((element) => element.innerText); // Convert extracted items into array
  return items;
}

/*
Helper method to scroll the "infite" scroll items on Skyscanner's flight listings page. and for each listing, store the airline
site URL in an array for use in other methods.
*/
async function scrapeListingForUrlInfinteScrollItems(
  page,
  extractedItems,
  targetItemCount,
  scrollDelay = 1000
) {
  let items = []; // To store all listings we get from DON

  try {
    let previousHeight;

    await page.goto(testUrl, { waitUntil: "networkidle2" });
    const html = await page.evaluate(() => document.body.innerHTML);
    const $ = await cheerio.load(html);

    await page.click(
      "#app-root > div[class^='FlightsDayView_row']> div > div[class^='FlightsDayView_container'] > div[class^='FlightsDayView_results'] > div:nth-child(1) > button"
    ); // Click "Show more result button" to start infinite scrolling

    const listingAirlineUrl = [];

    // Infinite scrolling algo: Check how many listings are in the DON, and if it's below our targetItemCount, we tell the browser to keep scorlling until the listings count is equal to the target value.
    while (items.length < targetItemCount) {
      // Iterate through flight listings, and for each listing, save the airline booking site URL
      // Note: Using regex to match class containing "FlightsTicket_link" to get listing since actual class name contains nonsense string appended to end.
      $('a[class*="FlightsTicket_link"]').each((i, element) => {
        listingAirlineUrl.push(baseUrl + $(element).attr("href"));
      });

      items = await page.evaluate(extractedItems); // Get an update of listings in DON

      previousHeight = await page.evaluate("document.body.scrollHeight");
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)"); // Function that runs inside brower that'll scroll to bottom of page
      await page.waitForFunction(
        `document.body.scrollHeight > ${previousHeight}`
      ); // Check if we exucuted above function
      await page.waitFor(scrollDelay); // To-do: set scrollDelay to random values to reduce risk of getting detected
    }

    return listingAirlineUrl;
  } catch (error) {
    console.log(error);
  }
}

// No longer used since infinite scrolling method is used instead
// Ticket listings on Skyscanner consist of images, so we can't scrape data directly.
// Instead, we'll go through the listing (infinite scrolling page), grab the URLs each listing and
// save it in an array for later processing.
// async function scrapeListingForUrl(allListingsUrl) {
//   try {
//     const page = await browser.newPage();
//     await page.goto(allListingsUrl, { waitUntil: "networkidle2" });
//     const html = await page.evaluate(() => document.body.innerHTML);
//     // fs.writeFileSync("./listing.html", html); // For testing

//     const $ = await cheerio.load(html); // Inject jQuery to easily get content of site more easily compared to using raw js

//     // Iterate through flight listings
//     // Note: Using regex to match class containing "FlightsTicket_link" to get listing since actual class name contains nonsense string appended to end.
//     const listingAirlineUrl = [];
//     $('a[class*="FlightsTicket_link"]').each((i, element) => {
//       listingAirlineUrl.push(baseUrl + $(element).attr("href"));
//     });

//     return listingAirlineUrl;
//   } catch (error) {
//     console.log("Scrape flight url failed.");
//     console.log(error);
//   }
// }

async function main() {
  try {
    // const isSiteScrapable = await getRobotsTxt();
    // console.log(
    //   `Is ${baseUrl} legally able to be scrapped? ${isSiteScrapable}`
    // );

    // await connectToMongoDB();

    browser = await puppeteer.launch({ headless: false }); // Note: Headless means browser will be hidden when app launches
    const page = await browser.newPage();
    page.setViewport({ width: 1680, height: 891 });
    await page.setDefaultNavigationTimeout(0);
    // await page.goto(baseUrl); // Visit URL

    // if (
    //   checkStringInput(credentials.emai) &&
    //   checkStringInput(credentials.password)
    // ) {
    //   await signIn(page, credentials.email, credentials.password); // Not working because of Captcha
    // }

    // await completeSearchField(page, flightSearchParams);
    // await page.click('button[type="submit"]');
    // await page.waitForNavigation({ waitUntil: "networkidle2" }); // Wait until page is finished loading before navigating

    // const targetItemCount = 100; // Number of listings to get from infinite scrolling page
    // const listingAirlineUrl = await scrapeListingForUrlInfinteScrollItems(page, extractItems, targetItemCount);

    const dummyData = [
      // "https://www.skyscanner.com//transport/flights/bos/cun/210301/210331/config/10081-2103010815--32733-0-10803-2103011250|10803-2103311512--32171-0-10081-2103312025?adults=1&adultsv2=1&cabinclass=economy&children=0&childrenv2=&destinationentityid=27540602&inboundaltsenabled=false&infants=0&originentityid=27539525&outboundaltsenabled=false&preferdirects=false&preferflexible=false&ref=home&rtn=1",
      "https://www.skyscanner.com/transport/flights/bos/cun/210301/210331/config/10081-2103010800--31722-1-10803-2103011425%7C10803-2103311512--32171-0-10081-2103312025?adults=1&adultsv2=1&cabinclass=economy&children=0&childrenv2=&destinationentityid=27540602&inboundaltsenabled=false&infants=0&originentityid=27539525&outboundaltsenabled=false&preferdirects=false&preferflexible=false&ref=home&rtn=1",
    ];
    const scrappedListingInfo = await scrapeListingInfo(page, dummyData);

    // console.log(scrappedListingInfo);

    // browser.close();
    // mongoose.disconnect(); // Close db connection
    // console.log("disconnected from mongodb!");

    // return scrappedListingInfo;
  } catch (error) {
    console.log(error);
  }
}

main();

// Used by Heroku to scape Skyscanner as defined by chron job interval
// app.get("/scrapeSkyscanner", async (req, res, next) => {
//   try {
//     res.setHeader("Content-Type", "application/json"); // Set to JSON else res will be text/html by default, which makes viewing the response messy
//     const scrappedListingInfo = main();

//     res.send(scrappedListingInfo);
//   } catch (error) {
//     console.log("GET error");
//     console.log(error);
//   }
// });

// app.listen(4000, () => {
//   console.log("Server running on port 4000");
// });
