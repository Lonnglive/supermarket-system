# Mobile OTP setup (Twilio)

The application uses Twilio Programmable Messaging to deliver the securely generated, single-use OTP to a mobile number.

1. Create a Twilio account and obtain a phone number that can send SMS to your users.
2. In the server `.env`, add:

```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+14155550100
```

3. Restart the server after saving `.env`.

Use full E.164 numbers in the app, such as `+917863475690`. Twilio trial accounts can send only to verified destination numbers; upgrade the account for unrestricted delivery.

Never put these credentials in the client `.env` or commit them to source control.
