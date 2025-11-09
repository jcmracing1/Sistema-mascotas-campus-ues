// models/visit.js
import mongoose from "mongoose";
const visitSchema = new mongoose.Schema({
  lat: Number,
  lng: Number,
  ts: Number,
  insideCampus: Boolean
});
export default mongoose.model("Visit", visitSchema);
