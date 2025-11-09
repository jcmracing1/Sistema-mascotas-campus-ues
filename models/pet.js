// models/pet.js
import mongoose from "mongoose";
const petSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  photoUrl: String,
  createdAt: { type: Date, default: Date.now }
});
export default mongoose.model("Pet", petSchema);
