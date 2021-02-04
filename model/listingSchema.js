const mongoose = require("mongoose");

const Schema = mongoose.Schema;

// Create schema for our flights db.
// MongoDB doesn't require a schema but it's safer having one.
const listingSchema = new Schema({
<<<<<<< HEAD
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
=======
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
>>>>>>> 9c96262bd08950e92daa3d5dd93d88d675614d91
});

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;
