# Sponsor operations template

Use this checklist for each direct sponsorship. Do not accept creative or claims that conflict with the standards on the public sponsor page.

## Enquiry reply

Subject: Calendar Contact Tools sponsorship — availability

Hello [name],

Thanks for asking about sponsoring Calendar Contact Tools. The standard direct placement is [price and currency] per month. It is clearly labeled, has no tracking pixel or behavioral targeting, and runs for an agreed start date through the day before the exclusive end date.

Please send:

- legal/business name and billing address;
- product name and HTTPS destination URL;
- preferred homepage, calendar-tool, or contact-tool placement;
- requested month;
- a factual description of roughly 80–120 characters;
- a square PNG/WebP, or simple reviewed SVG, under 100 KB;
- invoice contact and any purchase-order requirement.

I will confirm audience fit, inventory, exact dates, and the final card before invoicing. Bookings are monthly and can be cancelled before the next period.

Regards,

[maintainer]

## Onboarding checklist

- Confirm the product fits an allowed category and is safe for a general audience.
- Check the destination is HTTPS and contains no redirect to an unsafe scheme.
- Agree placement, price, currency, start date, and exclusive end date in writing.
- Confirm the factual card copy and locally hosted asset with the sponsor.
- Issue an invoice using the agreed legal and tax details; do not store billing data in this repository.
- Add a unique record to `src/data/sponsors.json` and the approved asset to `public/sponsors/`.
- Run `npm run validate:sponsors`, tests, and the production build.
- Preview the card at mobile and desktop widths in light and dark themes.
- Record invoice/payment status in the maintainer’s private accounting system, not sponsor JSON.

## Renewal / offboarding checklist

- Contact the sponsor before renewal only if they opted into operational renewal contact.
- For renewal, agree a new date window and update the record through normal review.
- For cancellation, non-renewal, or expiry, leave the historical record inactive or expired; do not rewrite history.
- Verify the card disappears at the start of `endDate` and that inventory becomes available.
- Retain invoices according to applicable accounting obligations outside this public repository.

## Sponsor record example

```json
{
  "id": "product-2026-09",
  "name": "Product name",
  "description": "A short factual description relevant to calendar or contact professionals.",
  "image": "/sponsors/product.png",
  "url": "https://product.example/",
  "placement": ["ics-tools"],
  "startDate": "2026-09-01",
  "endDate": "2026-10-01",
  "label": "Sponsor",
  "isActive": true
}
```

`startDate` is inclusive. `endDate` is exclusive.
