const mongoose = require("mongoose");

const Schema = mongoose.Schema;

// Create schema for our flights db.
// MongoDB doesn't require a schema but it's safer having one.
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

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;
