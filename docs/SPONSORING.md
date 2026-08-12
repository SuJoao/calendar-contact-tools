# Sponsoring operations

The public sponsor page defines placement standards, current price, inventory, and acceptable creative. These notes cover maintainer operations; billing and outreach records stay outside the repository.

## Outreach

Contact only relevant public business addresses with a personalized one-to-one message. Explain that placements are fixed, clearly labeled, served locally, and contain no tracking pixel or behavioral targeting. Share traffic only after a measured period and definition exist. Stop after one follow-up and honor opt-outs.

Never share user file data, imply endorsement, or store an outreach list in this project.

## Enquiry and onboarding

Confirm in writing:

- legal/business and invoice contact details;
- product name and HTTPS destination;
- homepage, calendar-tool, or contact-tool placement;
- start date, exclusive end date, price, and currency;
- factual description of roughly 80–120 characters;
- reviewed square PNG/WebP or simple SVG under 100 KB.

Check audience fit and the destination before invoicing. Store tax, payment, and purchase-order details in the maintainer's private accounting system—not sponsor JSON.

After approval, add the record to `src/data/sponsors.json` and artwork to `public/sponsors/`. Run sponsor validation, tests, and the production build; preview desktop/mobile and light/dark states.

## Renewal and offboarding

Contact sponsors about renewal only when they opted into operational contact. Agree a new date window for renewal. On cancellation or expiry, verify the card disappears at the exclusive `endDate` and inventory becomes available. Retain invoices according to applicable accounting rules outside this repository.

## Sponsor record

```json
{
  "id": "product-2026-09",
  "name": "Product name",
  "description": "A short factual description for calendar or contact professionals.",
  "image": "/sponsors/product.png",
  "url": "https://product.example/",
  "placement": ["ics-tools"],
  "startDate": "2026-09-01",
  "endDate": "2026-10-01",
  "label": "Sponsor",
  "isActive": true
}
```

`startDate` is inclusive; `endDate` is exclusive.
