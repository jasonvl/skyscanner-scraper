Overview:
Skyscanner scraper that

1. Checks for scrapping permissions using Skyscanner’s robots.txt
2. Logs into site using person’s email and password
3. Fills and submits flight search field e.g., source city, destination city, one-way or round-trip, number of travelers, and cabin type
4. Scraps listing details based off flight search and stores it in MongoDB Atlas cloud

Scarper is deployed to Heroku, where a scheduler sets up a cron job to call an API that starts the scarper.

Tools:
• Puppeteer - Used for automated browsing. Originally, I wanted to use Request to scrap the site since it uses less resources and is also less prone to breaking, however, it couldn’t be used because Skyscanner can’t be rendered without JavaScript disabled. I also tried looking for a Skyscanner API that returns the necessary info for scrapping, but no luck.
• Request, Request-promise – used to download contents of site.
• Cheerio – Used to use jQuery selectors inside NodeJS.
• MongoDB Atlas – Used to store our scraped data.
• Heroku – Used to deploy the scrapper and to schedule calling the app API parodically.

Limitations:
• Error where Skyscanner is taking too long to load in Chromium, so the third step of iterating through the listing, saving the booking URLs, and scrapping the listing data based off the booking URLs needs to be fixed.
