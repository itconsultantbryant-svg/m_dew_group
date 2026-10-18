# Mountain Dew Group — mobile app

An Expo / React Native client for guests: search availability, book a stay and look up an existing
booking. It talks to the same `@mdg/api` REST API as the website and shares `@mdg/domain` (money,
dates, DTOs) and `@mdg/api-client`.

## Requirements

- Node.js ≥ 20 and pnpm
- Expo Go app on a device, or an iOS/Android simulator
- The API running and reachable from the device (`EXPO_PUBLIC_API_URL`)

## Configuration

Create `apps/mobile/.env` (or set an EAS secret for production builds):

```
EXPO_PUBLIC_API_URL="http://localhost:4100"
```

> On a physical device `localhost` refers to the phone. Use your computer's LAN IP, e.g.
> `http://192.168.1.20:4100`, and make sure the API's `CORS_ORIGINS` / firewall allow it.

## Run

```bash
# from the repository root, after `pnpm install`
pnpm dev:mobile          # expo start  (press i / a / w)
```

## Screens

The app is a single, self-contained flow (`App.tsx`):

1. **Search** — pick dates and party size.
2. **Select** — browse available room types with pay-at-property totals.
3. **Details** — enter lead guest details and confirm.
4. **Confirmation** — show the booking reference and balance due.
5. **Manage** — look up an existing booking by reference and surname.

## Production builds

Use [EAS](https://docs.expo.dev/eas/):

```bash
npm i -g eas-cli
eas login
eas build --platform ios
eas build --platform android
```

Set `EXPO_PUBLIC_API_URL` to the public API origin as an EAS secret before building. Push
notifications require an Expo access token on the API (`EXPO_PUSH_ACCESS_TOKEN`).

## Notes

- No payment is collected in the app; guests pay at the property.
- Every rate and description is demonstration content pending business approval.
