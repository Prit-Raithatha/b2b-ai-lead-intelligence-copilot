# n8n V1 Workflow (add after the web app works)

## Goal
Show that the same lead-analysis logic can be automated when a new B2B enquiry arrives.

## Nodes
1. **Webhook**
   - Method: POST
   - Path: `new-buyer-enquiry`
   - Expected input:
   ```json
   {"enquiry":"Need 500 metres premium blackout fabric for a hotel in Dwarka"}
   ```

2. **OpenAI / LLM node — Extract requirement**
   System prompt:
   `Extract only facts present in the enquiry. Return JSON. Never invent unknown values.`

   Required JSON:
   `category, product_type, quantity, unit, colors, buyer_type, location, delivery_timeline, budget, use_case, missing_information`

3. **Code node — Lead score**
   Use deterministic points:
   - product/category known: +15
   - quantity: +20
   - location: +10
   - delivery timeline: +15
   - buyer type: +15
   - budget: +10
   - use case: +10
   - product preference/color: +5

4. **HTTP Request node**
   POST the enquiry to your deployed web app `/api/analyze` endpoint.
   This endpoint performs embeddings-based product retrieval and returns the top matches.

5. **IF node**
   - score >= 75 → High Priority
   - otherwise → Normal Queue

6. **Respond to Webhook**
   Return structured requirement, score, products and grounded reply.

## Optional visible automation
For High Priority leads, add:
- Google Sheets → append lead
- Gmail → create supplier follow-up draft

Do not add these until the core workflow is stable.
