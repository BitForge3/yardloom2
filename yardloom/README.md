# Yardloom

Property listings with accounts, admin review, paid featured listings and an Agent plan (Paystack).

## Run it locally
1. Install Node 20.6 or newer, then `npm install`.
2. `cp .env.example .env` and add your Paystack **test** secret key.
3. `npm run dev`, then open http://localhost:3000
4. Register on the site, then make yourself admin: `npm run make-admin -- you@example.com`

## Email (needed for sign-up confirmation and password reset)
1. Create a free account at resend.com, verify your domain, and create an API key.
2. Set `RESEND_API_KEY` and `MAIL_FROM` (for example `Yardloom <hello@yourdomain.com>`).
Until your domain is verified, Resend's test sender only delivers to your own email.
If no key is set, emails are printed in the server log instead, which is handy when testing locally.

## Legal pages
Edit `public/terms.html` and `public/privacy.html`: replace every [bracket], then have a Nigerian lawyer review them.

## Settings
- `RESEND_API_KEY`, `MAIL_FROM`: see Email above.
- `PAYSTACK_SECRET`: secret key from the Paystack dashboard.
- `BASE_URL`: your public address, for example https://yardloom.ng (use https in production).
- `DB_PATH`: SQLite file location. Put it on a persistent disk.

## Deploy on Render (example)
1. Push this folder to a private GitHub repo.
2. Render: New > Web Service. Build command `npm install`, start command `npm start`.
3. Add a Disk mounted at `/var/data`. Set env vars: `DB_PATH=/var/data/yardloom.db`, `BASE_URL=https://your-app.onrender.com`, `PAYSTACK_SECRET`.
4. Register on the live site, then run `npm run make-admin -- you@example.com` in the Render shell (use `node make-admin.js` there).
5. Paystack dashboard > Settings > API Keys & Webhooks: set webhook to `https://your-domain/api/paystack/webhook`.
6. Test with Paystack test keys, then switch to live keys.

## Rules built in
- Free accounts: 3 listings. Agent plan (₦20,000 per 30 days): unlimited listings and an automatic Verified badge. Renew by paying again.
- Prices: edit `PRICES`, `AGENT_PRICE`, `FREE_LIMIT` at the top of `server.js` and the labels in `public/index.html`.

## Security
Built in: hashed passwords (scrypt), HttpOnly SameSite cookies with 30-day server-side expiry, login rate limiting,
security headers with a strict Content-Security-Policy, same-origin check on requests, signed and amount-checked Paystack
webhook, input validation, and admin role set only from the server (never by signing up).

You still need to:
- Serve over HTTPS only (hosts like Render do this for you).
- Keep Paystack keys secret. Never commit `.env`. Use test keys until everything works.
- Back up the `.db` file daily and test a restore.
- Run `npm audit` now and then and update packages.
- Comply with the Nigeria Data Protection Act: add a privacy policy, since you store names, emails and phone numbers.
