Mascotas UES - JSONBin (per-pet bin)

This version creates a private JSONBin per pet and stores the photo (base64) inside the bin.
Be aware that the X-Master-Key is embedded in script.js - consider creating Access Keys on JSONBin for safety.

Instructions:
1. Upload this folder to GitHub and enable Pages.
2. Open the page, add pets (a bin will be created per pet).
3. Ensure ThingSpeak channel 3146056 publishes field1 and field2.
4. The app will poll ThingSpeak and append visits to each pet's bin only when the location changes.
