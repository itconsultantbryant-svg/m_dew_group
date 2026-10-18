import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ApiClient, ApiError } from '@mdg/api-client';
import { formatMoney, type AvailabilityResponseDto, type QuoteDto, type ReservationDto } from '@mdg/domain';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100';
const client = new ApiClient({ baseUrl: API_URL });

const color = {
  forest: '#173D32',
  forestDark: '#0E2A22',
  ivory: '#F7F3EA',
  ivoryDim: '#EFE8D9',
  charcoal: '#222722',
  charcoalSoft: '#4B534B',
  brass: '#AE864A',
  danger: '#9B3B2E',
  success: '#2F6B4F',
  white: '#FFFFFF',
};

type Step = 'search' | 'select' | 'details' | 'done' | 'manage';

function todayISO(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default function App() {
  const [step, setStep] = useState<Step>('search');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [checkIn, setCheckIn] = useState(todayISO(1));
  const [checkOut, setCheckOut] = useState(todayISO(3));
  const [adults, setAdults] = useState('2');

  const [availability, setAvailability] = useState<AvailabilityResponseDto | null>(null);
  const [selected, setSelected] = useState<AvailabilityResponseDto['results'][number] | null>(null);
  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [confirmation, setConfirmation] = useState<{ reservation: ReservationDto; manageToken: string } | null>(null);

  const [guest, setGuest] = useState({ firstName: '', lastName: '', phoneNumber: '', email: '' });

  const [lookup, setLookup] = useState({ reference: '', lastName: '' });
  const [managed, setManaged] = useState<ReservationDto | null>(null);

  const search = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await client.searchAvailability({
        checkIn,
        checkOut,
        rooms: 1,
        adults: Number(adults) || 2,
        children: 0,
      });
      setAvailability(result);
      setStep('select');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load availability.');
    } finally {
      setBusy(false);
    }
  }, [checkIn, checkOut, adults]);

  async function selectRoom(item: AvailabilityResponseDto['results'][number]) {
    setBusy(true);
    setError(null);
    try {
      const q = await client.createQuote({
        checkIn,
        checkOut,
        rooms: [{ roomTypeId: item.roomType.id, ratePlanId: item.ratePlanId, quantity: 1, adults: Number(adults) || 2, children: 0 }],
      });
      setSelected(item);
      setQuote(q);
      setStep('details');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not price your stay.');
    } finally {
      setBusy(false);
    }
  }

  async function book() {
    if (!quote || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const created = await client.createHold({
        checkIn,
        checkOut,
        rooms: [{ roomTypeId: selected.roomType.id, ratePlanId: selected.ratePlanId, quantity: 1, adults: Number(adults) || 2, children: 0 }],
        quoteFingerprint: quote.fingerprint,
      });
      const result = await client.createReservation({
        holdId: created.holdId,
        quoteFingerprint: quote.fingerprint,
        leadGuest: {
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: guest.email || undefined,
          phoneCountryCode: '+231',
          phoneNumber: guest.phoneNumber,
          communicationPreference: 'EMAIL',
          marketingConsent: false,
          acceptTerms: true,
          acceptPrivacy: true,
        },
        idempotencyKey: `mobile-${created.holdId.slice(0, 8)}`,
      });
      setConfirmation(result);
      setStep('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete your booking.');
    } finally {
      setBusy(false);
    }
  }

  async function findBooking() {
    setBusy(true);
    setError(null);
    try {
      const result = await client.lookupReservation({ reference: lookup.reference.trim().toUpperCase(), lastName: lookup.lastName.trim() });
      setManaged(result.reservation);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'No booking found for that reference and surname.' : 'Lookup failed.');
    } finally {
      setBusy(false);
    }
  }

  const header = useMemo(() => {
    const titles: Record<Step, string> = {
      search: 'Book a stay',
      select: 'Choose a room',
      details: 'Your details',
      done: 'Booking confirmed',
      manage: 'Manage booking',
    };
    return titles[step];
  }, [step]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.brand}>Mountain Dew Group</Text>
        <Text style={styles.headerTitle}>{header}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {step === 'search' ? (
          <View>
            <Label text="Check-in" />
            <TextInput style={styles.input} value={checkIn} onChangeText={setCheckIn} autoCapitalize="none" />
            <Label text="Check-out" />
            <TextInput style={styles.input} value={checkOut} onChangeText={setCheckOut} autoCapitalize="none" />
            <Label text="Adults" />
            <TextInput style={styles.input} value={adults} onChangeText={setAdults} keyboardType="number-pad" />
            <PrimaryButton label={busy ? 'Searching…' : 'Check availability'} onPress={search} disabled={busy} />
            <Pressable onPress={() => setStep('manage')} style={styles.linkButton}>
              <Text style={styles.link}>Manage an existing booking</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 'select' && availability ? (
          <View>
            <Text style={styles.muted}>
              {availability.nights} night{availability.nights === 1 ? '' : 's'} · {availability.checkIn} → {availability.checkOut}
            </Text>
            {availability.results.map((item) => (
              <View key={item.roomType.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.roomType.name}</Text>
                <Text style={styles.muted}>{item.roomType.shortDescription}</Text>
                <Text style={styles.price}>{formatMoney(item.stayTotal)}</Text>
                <Text style={styles.muted}>
                  {item.availableCount} available · {formatMoney(item.averageNightly)}/night
                </Text>
                <PrimaryButton label={busy ? 'Please wait…' : 'Select'} onPress={() => void selectRoom(item)} disabled={busy} />
              </View>
            ))}
            <SecondaryButton label="Change dates" onPress={() => setStep('search')} />
          </View>
        ) : null}

        {step === 'details' && quote ? (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{selected?.roomType.name}</Text>
              <Text style={styles.muted}>{quote.checkIn} → {quote.checkOut} · {quote.nights} night{quote.nights === 1 ? '' : 's'}</Text>
              <Text style={styles.price}>Total {formatMoney(quote.total)}</Text>
              <Text style={styles.muted}>Pay at the property. {quote.cancellationSummary}</Text>
            </View>
            <Label text="First name" />
            <TextInput style={styles.input} value={guest.firstName} onChangeText={(v) => setGuest({ ...guest, firstName: v })} />
            <Label text="Last name" />
            <TextInput style={styles.input} value={guest.lastName} onChangeText={(v) => setGuest({ ...guest, lastName: v })} />
            <Label text="Phone number" />
            <TextInput style={styles.input} value={guest.phoneNumber} onChangeText={(v) => setGuest({ ...guest, phoneNumber: v })} keyboardType="phone-pad" />
            <Label text="Email (optional)" />
            <TextInput style={styles.input} value={guest.email} onChangeText={(v) => setGuest({ ...guest, email: v })} keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.terms}>By confirming you accept the booking terms and cancellation policy.</Text>
            <PrimaryButton label={busy ? 'Confirming…' : 'Confirm booking'} onPress={book} disabled={busy || !guest.firstName || !guest.lastName || !guest.phoneNumber} />
            <SecondaryButton label="Back" onPress={() => setStep('select')} />
          </View>
        ) : null}

        {step === 'done' && confirmation ? (
          <View style={styles.card}>
            <Text style={styles.success}>Booking confirmed</Text>
            <Text style={styles.cardTitle}>Reference {confirmation.reservation.reference}</Text>
            <Text style={styles.muted}>Thank you, {confirmation.reservation.leadGuestName}. Balance of {formatMoney(confirmation.reservation.balanceDue)} is due at the property.</Text>
            <PrimaryButton label="Make another booking" onPress={() => { setConfirmation(null); setSelected(null); setQuote(null); setStep('search'); }} />
          </View>
        ) : null}

        {step === 'manage' ? (
          <View>
            <Label text="Booking reference" />
            <TextInput style={styles.input} value={lookup.reference} onChangeText={(v) => setLookup({ ...lookup, reference: v.toUpperCase() })} autoCapitalize="characters" />
            <Label text="Surname" />
            <TextInput style={styles.input} value={lookup.lastName} onChangeText={(v) => setLookup({ ...lookup, lastName: v })} />
            <PrimaryButton label={busy ? 'Looking up…' : 'Find my booking'} onPress={findBooking} disabled={busy} />
            {managed ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{managed.reference}</Text>
                <Text style={styles.muted}>{managed.status} · {managed.checkIn} → {managed.checkOut}</Text>
                <Text style={styles.muted}>Balance due {formatMoney(managed.balanceDue)}</Text>
              </View>
            ) : null}
            <SecondaryButton label="Back to booking" onPress={() => setStep('search')} />
          </View>
        ) : null}
      </ScrollView>

      {busy ? (
        <View style={styles.overlay}>
          <ActivityIndicator color={color.ivory} size="large" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.primary, disabled ? styles.disabled : null]}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.secondary}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.ivory },
  header: { backgroundColor: color.forest, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 18 },
  brand: { color: color.brass, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle: { color: color.ivory, fontSize: 26, fontWeight: '700', marginTop: 4 },
  content: { padding: 20, gap: 8 },
  label: { color: color.charcoalSoft, fontSize: 13, fontWeight: '600', marginTop: 12 },
  input: {
    backgroundColor: color.white,
    borderColor: 'rgba(34,39,34,0.2)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: color.charcoal,
    fontSize: 16,
  },
  card: {
    backgroundColor: color.white,
    borderRadius: 14,
    borderColor: 'rgba(34,39,34,0.1)',
    borderWidth: 1,
    padding: 16,
    marginTop: 14,
    gap: 4,
  },
  cardTitle: { color: color.forest, fontSize: 18, fontWeight: '700' },
  muted: { color: color.charcoalSoft, fontSize: 14 },
  price: { color: color.forest, fontSize: 20, fontWeight: '700', marginTop: 6 },
  primary: { backgroundColor: color.forest, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  primaryText: { color: color.ivory, fontSize: 16, fontWeight: '700' },
  secondary: { borderColor: color.forest, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  secondaryText: { color: color.forest, fontSize: 15, fontWeight: '600' },
  linkButton: { marginTop: 18, alignItems: 'center' },
  link: { color: color.forest, textDecorationLine: 'underline' },
  disabled: { opacity: 0.5 },
  error: { backgroundColor: '#F6E1DC', color: color.danger, padding: 12, borderRadius: 8, fontWeight: '600' },
  success: { color: color.success, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  terms: { color: color.charcoalSoft, fontSize: 12, marginTop: 12 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(14,42,34,0.25)', alignItems: 'center', justifyContent: 'center' },
});
