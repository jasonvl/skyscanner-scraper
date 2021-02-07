<h1>Overview</h1>
In brief, this scrapper app is used to scrape the SkyScanner travel site for flight listing information.

When executed, the app will run in the following order:

1. Listen for request from Heroku's scheduler tool, which uses a cron job to call index.js every hour. Note that Heroku scheduler works by specifying a target file, so an API and .yaml is not necessary. However, an API is included for tesiting and also if anyone wants to deploy using another method such as GCP.
2. After request is made, the app checks for scrapping permissions using SkyScanner’s robots.txt. Since SkyScanner doesn't like scrappers, we ignore those permission and proceed anyways :)
3. Log into site using credentials stored in credentials/credentials.js. Note: not working because of CAPTCHA.
4. Fill in search parameters e.g., source city, destination city, one-way or round-trip, number of travelers, cabin type according to the values in searchFieldParams.js, and then send the search request.
5. Once the search results are loaded, iterate the listings and for each listing, scrap the listing details according to the following schema:

   ```javascript
   const listingSchema = new Schema({
     bookingURL: String,
     flexibleTicket: Boolean,
     outboundAirline: String,
     returnAirline: String,
     ticketPrice: String,
     outboundDirectFlight: Boolean,
     outboundDate: String,
     outboundTripDuration: String,
     outboundStartTime: String,
     outboundEndTime: String,
     returnDirectFlight: Boolean,
     returnDate: String,
     returnStartTime: String,
     returnEndTime: String,
     returnTripDuration: String,
   });
   ```

   In more details, the way the scrapping works is by first iterating all the listings and storing the booking URL for each listing. The reason this needs to be done is becasue the listenings are show as images, so we can't extract any useful information except by clicking on the listing, which redirects you to another page. Once we have the list of URLs, we can iterate through that list, visit each URL, and scrape the pages in that manner.

   Since the listing page is an infinite scrolling page, we make use of a variable called "targetItemCount" to keep scrolling until that target is reached.

6. Each scrapped listing will be persisted to a MongoDB database in Atlas (cloud).
7. To-do: Add querying logic to query database for best deals every X hours.

<h1>Tools Used</h1>
Puppeteer - Used for browser automation. Originally, I wanted to scape using Request since it's faster,  less resources intensive, and less prone to breaking. However, it's not possible because the site can’t be rendered with JavaScript disabled. Additionally, I tried looking for a SkyScanner API that returns the necessary info for scrapping, but no luck finding one.

Cheerio – Used to analyze web page using jQuery, which faster and easier than writing raw JavaScript.

MongoDB Atlas – Cloud environment used to store our scraped data.

Heroku – Used to deploy the scrapper and for scheduling.

<h1>Limitations</h1>
Signing in doesn't work because of CAPTCHA.

SkyScanner will periodically ask you to complete a CAPTCHA because of suspicious behavior, in which case the app stops working.

<h1>Time analysis</h1>
Time O(n) where n is the number of listings we specified since we're iterating through the listings, and scrapping each listing.

Space O(n) where n is the number of listings we specified since we need to store the list of URLs and scrapping information for each listing.

<h1>Useage (Run Locally)</h1>

git clone https://github.com/jasonvl/skyscanner-scraper.git

npm install

Enter search parameters in searchFieldParams.js

Specify the targetItemCount variable value in main of index.js to get the number of listings to be scrapped.

Create MongoDB Atlas account, and replace password and database_name in config/mongoConfigExample.js with your credentials.

Modify setViewport in main() of index.js to match your screen's resolution. This is important or else the infinite scrolling feature won't work.

<h1>Useage (Deployment With Scheduler)</h1>

git clone https://github.com/jasonvl/skyscanner-scraper.git

npm install

Enter search parameters in searchFieldParams.js

Specify the targetItemCount variable value in main of index.js to get the number of listings to be scrapped.

Create MongoDB Atlas account, and replace password and database_name in config/mongoConfigExample.js with your credentials.

Set headless mode to true in main() of index.js e.g., `puppeteer.launch({ headless: false });`

If deploying to Heroku, sign up for a Heroku account, download the CLI https://devcenter.heroku.com/articles/heroku-cli and then create an app. Follow the instructions for creating a Heroku repo.

Note that you'll have to add a buildpack to get Puppeteer working for Heroku.The buildpack we need is https://elements.heroku.com/buildpacks/jontewks/puppeteer-heroku-buildpack and can be added by running
`heroku buildpacks:add jontewks/puppeteer` in root. After adding the buildpack, do a push to Heroku to create a new release using the buildpack. You’ll have to make a commit before pushing the buildpack, which you can do by making any change to your file. It’s important to do a push BEFORE adding the buildpack.

For scheduling, go to “Resources” and search for “Heroku Scheduler”. The scheduler will set up a cron job to run the app. You just have to specify the target file (index.js).

If using another deployment method such as GCP, use the API instead and edit the cron.yaml file.
