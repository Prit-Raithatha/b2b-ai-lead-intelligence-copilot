# QUICK GEMINI SETUP — WINDOWS

1. Create a Gemini API key in Google AI Studio.
2. In VS Code PowerShell, inside this project folder, run:

```powershell
$env:GEMINI_API_KEY="PASTE_YOUR_KEY_HERE"
npm start
```

3. Open `http://localhost:3000`
4. Optional health check: `http://localhost:3000/api/health`
5. Test this enquiry:

`Need 500 metres premium blackout curtain fabric for a hotel in Dwarka. Beige or cream preferred. Delivery within 15 days.`

Expected: AI_RAG mode, structured extraction, explainable lead score, 3 semantic product matches, and a grounded supplier response.

Never paste your API key into GitHub, screenshots, README files, or chat.
