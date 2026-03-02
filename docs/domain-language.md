5️⃣ Final Terminology Model
Here is your clean public taxonomy:

🏠 Property
Your asset.

🤝 Opportunity
A structured negotiation tied to a property.
Header example:
Opportunity for 123 Main St
Not:
Thread 4da2838f

💬 Offer
A set of proposed terms inside an Opportunity.

📄 Agreement
The DocuSign contract.

💼 Active Position
Once agreement is signed and funded.

6️⃣ Address in Title (Very Important UX Fix)
Yes. 100%.
IDs should never be primary headings.
Instead of:
Thread 4da2838f-…
Use:
Opportunity — 123 Main St, Annapolis MD
Fallback logic:
If property.address exists → show it


Else → show short property ID


Never show thread ID as primary header


Thread ID can live in a subtle metadata area:
Reference ID: 4da2838f…

7️⃣ Clean IA Structure
Top Navigation:
Dashboard
Properties
Opportunities
Deal Scenarios

Property Page:
Property: 123 Main St
Status: Verified

Opportunities
- Opportunity with John Doe (Offer Submitted)
- Opportunity with Jane Smith (Agreement Pending Signature)

Opportunity Page:
Opportunity — 123 Main St
Status: Offer Accepted — Agreement Pending

Offer Details
Participants
Activity
Next Steps

8️⃣ Final Status Ladder
Opportunity:
Open


Offer Submitted


Offer Accepted — Agreement Pending


Agreement Sent


Agreement Signed


Active


Closed


Offer:
Draft


Submitted


Accepted


Declined


Expired



9️⃣ Regulatory Comfort Check
This structure:
Avoids securities vocabulary


Avoids equity issuance language


Avoids premature execution language


Mirrors residential real estate UX


Clearly separates negotiation from binding contract


You are safe.

🔟 Strategic Suggestion
You should document this vocabulary as:
FractPath Canonical Domain Language v1.0
So marketing, legal, product, and engineering never drift.

