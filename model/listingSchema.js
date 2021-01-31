const mongoose = require("mongoose");

const Schema = mongoose.Schema;

// Create schema for our flights db.
// MongoDB doesn't require a schema but it's safer having one.
const listingSchema = new Schema({
  airline: String,
  ticketPrice: String,
  outboundStartTime: Date,
  outboundEndTime: Date,
  outboundDirectFlight: Boolean,
  outboundTripDuration: String,
  returnStartTime: Date,
  returnEndTime: Date,
  returnDirectFlight: Boolean,
  returnTripDuration: String,
  flexibleTicket: Boolean,
  bookingURL: String,
});

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;
